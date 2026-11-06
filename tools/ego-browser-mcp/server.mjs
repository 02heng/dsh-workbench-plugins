#!/usr/bin/env node
/**
 * ego-browser MCP server for DeepSeek Harness
 *
 * 把 ego lite 浏览器（https://github.com/citrolabs/ego-lite）封装成 MCP 工具，
 * 供 DSH 在“任何浏览器相关任务”里直接调用，不用再手写 .mjs 脚本。
 *
 * 每个工具调用 = 一次 `ego-browser nodejs` 进程，脚本通过 stdin 传入（官方支持），
 * 任务空间（space）在多次调用间保留，页标签（p1/p2...）也保留。
 *
 * 环境变量：
 *   EGO_BROWSER_CLI  ego-browser.exe 路径（缺省自动从安装目录探测最新版本）
 *   EGO_BROWSER_SPACE  任务空间名（缺省 dsh-browser）
 *   EGO_BROWSER_TIMEOUT_MS 单次调用超时（缺省 180000）
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

const VERSION = "1.0.0";
const SERVER_NAME = "ego-browser";
const SPACE = process.env.EGO_BROWSER_SPACE || "dsh-browser";
const TIMEOUT_MS = Number(process.env.EGO_BROWSER_TIMEOUT_MS || 180000);
const RESULT_MARKER = "@@RESULT@@";
const MAX_TEXT = 20000;

function findCli() {
  const explicit = process.env.EGO_BROWSER_CLI;
  if (explicit && fs.existsSync(explicit)) return explicit;

  const base = "C:\\Program Files\\Citro Labs\\ego lite\\Application";
  const found = [];
  if (fs.existsSync(base)) {
    for (const entry of fs.readdirSync(base)) {
      const exe = path.join(base, entry, "ego-browser.exe");
      if (fs.existsSync(exe)) found.push({ entry, exe });
    }
  }
  if (!found.length) {
    throw new Error(
      "ego-browser.exe not found. Install ego lite or set EGO_BROWSER_CLI to the full path.",
    );
  }
  found.sort((a, b) => a.entry.localeCompare(b.entry, undefined, { numeric: true }));
  return found[found.length - 1].exe;
}

let CLI;
try {
  CLI = findCli();
} catch (err) {
  process.stderr.write(String(err.message) + "\n");
  CLI = null;
}

const cleanStream = (text) =>
  String(text || "")
    .split(/\r?\n/)
    .filter((item) => !item.startsWith(RESULT_MARKER))
    .join("\n")
    .trim();

function runScript(script) {
  if (!CLI) return Promise.reject(new Error("ego-browser CLI unavailable"));
  return new Promise((resolve, reject) => {
    const child = spawn(CLI, ["nodejs"], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        /* ignore */
      }
      reject(new Error(`ego-browser call timed out after ${TIMEOUT_MS}ms`));
    }, TIMEOUT_MS);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      // ego-browser 0.6.2.5 把脚本的 console 输出写到 stderr，这里两路都找。
      const line = [...stderr.split(/\r?\n/), ...stdout.split(/\r?\n/)]
        .reverse()
        .find((item) => item.startsWith(RESULT_MARKER));
      if (line) {
        try {
          resolve({ code, value: JSON.parse(line.slice(RESULT_MARKER.length)), stdout: cleanStream(stdout), stderr: cleanStream(stderr) });
          return;
        } catch (err) {
          reject(new Error(`cannot parse ego result: ${String(err && err.message)}`));
          return;
        }
      }
      resolve({ code, value: null, stdout: cleanStream(stdout), stderr: cleanStream(stderr) });
    });

    child.stdin.write(script, "utf8");
    child.stdin.end();
  });
}

const clamp = (text, limit = MAX_TEXT) => {
  const value = String(text ?? "");
  return value.length > limit ? value.slice(0, limit) + `\n…[truncated ${value.length - limit} chars]` : value;
};

function prelude() {
  return [
    `const __task = await taskSpace(${JSON.stringify(SPACE)});`,
    "const __pages = await __task.pages();",
    "const __labels = __pages.map((p) => p.label);",
  ].join("\n");
}

function pageFor(label) {
  const name = label || "p1";
  return [
    `const page = __labels.includes(${JSON.stringify(name)}) ? __task.page(${JSON.stringify(name)}) : await __task.newPage();`,
  ].join("\n");
}

function emit(expression) {
  return `console.log(${JSON.stringify(RESULT_MARKER)} + JSON.stringify(${expression}));`;
}

const tools = [
  {
    name: "browser_open",
    description:
      "在 ego 浏览器里打开网址（复用同一任务空间）。返回最终 URL、标题与页标签。后续 click/fill/snapshot 默认作用在同一页。",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "绝对 http(s) URL" },
        page: { type: "string", description: "页标签，缺省 p1" },
      },
      required: ["url"],
    },
    build: (args) =>
      [
        prelude(),
        pageFor(args.page),
        `await page.goto(${JSON.stringify(args.url)});`,
        "await page.waitForLoadState().catch(() => null);",
        emit("{ url: await page.url(), title: await page.title(), page: page.label, spaceId: __task.spaceId }"),
      ].join("\n"),
  },
  {
    name: "browser_snapshot",
    description:
      "获取当前页的语义化 DOM 快照（带 @ref 可点击引用），用于理解页面结构、找可操作目标。可指定 fullPage 抓整页。",
    inputSchema: {
      type: "object",
      properties: {
        page: { type: "string", description: "页标签，缺省 p1" },
        fullPage: { type: "boolean", description: "是否抓整页（默认仅视口）" },
        maxChars: { type: "number", description: "返回字符上限，默认 20000" },
      },
    },
    build: (args) =>
      [
        prelude(),
        pageFor(args.page),
        `const __snap = await page.snapshot(${args.fullPage ? '{ scope: "full_page" }' : "{}"});`,
        `const __limit = ${Number.isFinite(args.maxChars) ? Math.trunc(args.maxChars) : MAX_TEXT};`,
        emit("{ url: await page.url(), title: await page.title(), chars: __snap.length, snapshot: __snap.slice(0, __limit) }"),
      ].join("\n"),
  },
  {
    name: "browser_click",
    description:
      "点击元素。选择器支持快照里的 @ref（如 @21）、ref=21、text=登录、loc=css:、loc=role:button[name='确定']、xpath= 或裸 CSS。",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "选择器，例如 @21 或 loc=role:button[name='搜索']" },
        page: { type: "string", description: "页标签，缺省 p1" },
      },
      required: ["selector"],
    },
    build: (args) =>
      [
        prelude(),
        pageFor(args.page),
        `await page.click(${JSON.stringify(args.selector)});`,
        "await page.waitForLoadState().catch(() => null);",
        emit("{ clicked: true, url: await page.url(), title: await page.title() }"),
      ].join("\n"),
  },
  {
    name: "browser_fill",
    description:
      "向输入框填入文本（自动聚焦、自动滚入可视区）。submit=true 时填完按 Enter 提交。",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "输入框选择器，例如 @6 或 loc=css:input[name=q]" },
        text: { type: "string", description: "要填入的文本" },
        submit: { type: "boolean", description: "填完是否按 Enter" },
        page: { type: "string", description: "页标签，缺省 p1" },
      },
      required: ["selector", "text"],
    },
    build: (args) =>
      [
        prelude(),
        pageFor(args.page),
        `await page.fill(${JSON.stringify(args.selector)}, ${JSON.stringify(String(args.text))});`,
        args.submit ? `await page.press(${JSON.stringify(args.selector)}, "Enter");` : "",
        "await page.waitForTimeout(800);",
        "await page.waitForLoadState().catch(() => null);",
        emit("{ filled: true, url: await page.url(), title: await page.title() }"),
      ]
        .filter(Boolean)
        .join("\n"),
  },
  {
    name: "browser_extract",
    description:
      "在页面里执行一段 JS 表达式并返回结果（用它做批量取数，比快照省 token）。注意：必须传字符串形式的 JS，函数形式在 0.6.2.5 会报 Runtime.evaluate 错误。",
    inputSchema: {
      type: "object",
      properties: {
        script: {
          type: "string",
          description: '在页面上下文求值的 JS 表达式字符串，例如 [...document.querySelectorAll("h2")].map(h=>h.innerText)',
        },
        page: { type: "string", description: "页标签，缺省 p1" },
      },
      required: ["script"],
    },
    build: (args) =>
      [
        prelude(),
        pageFor(args.page),
        `const __value = await page.evaluate(${JSON.stringify(args.script)});`,
        "const __safe = typeof __value === 'string' ? __value : JSON.stringify(__value);",
        emit("{ url: await page.url(), type: typeof __value, value: __safe }"),
      ].join("\n"),
  },
  {
    name: "browser_screenshot",
    description:
      "截图当前页并返回文件路径。path 必须是绝对路径（用正斜杠）；不给则写到系统临时目录。",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "绝对路径，例如 C:/Users/me/shots/one.png" },
        page: { type: "string", description: "页标签，缺省 p1" },
      },
    },
    build: (args) =>
      [
        prelude(),
        pageFor(args.page),
        args.path
          ? `const __shot = await page.screenshot({ path: ${JSON.stringify(args.path)} });`
          : "const __shot = await page.screenshot();",
        emit("{ path: __shot, url: await page.url() }"),
      ].join("\n"),
  },
  {
    name: "browser_tabs",
    description: "列出当前任务空间里的所有标签页（页标签、标题、URL）。",
    inputSchema: { type: "object", properties: {} },
    build: () =>
      [
        prelude(),
        "const __tabs = await __task.tabs();",
        emit(
          "{ spaceId: __task.spaceId, tabs: __tabs.map((t) => ({ label: t.label, title: t.title, url: t.url, active: t.active })) }",
        ),
      ].join("\n"),
  },
  {
    name: "browser_run",
    description:
      "执行一段完整的 ego-browser 脚本（裸 JS，可用 taskSpace/page/await）。用于工具没覆盖的高级操作；脚本里自己 console.log，输出原样返回。",
    inputSchema: {
      type: "object",
      properties: { script: { type: "string", description: "完整 JS 脚本" } },
      required: ["script"],
    },
    build: (args) => String(args.script || ""),
    raw: true,
  },
  {
    name: "browser_close",
    description: "结束当前任务空间（关闭本次由 AI 打开的标签页）。",
    inputSchema: { type: "object", properties: { keep: { type: "boolean", description: "是否保留标签页" } } },
    build: (args) =>
      [
        prelude(),
        `await __task.finish({ keep: ${Boolean(args.keep)} });`,
        emit("{ closed: true }"),
      ].join("\n"),
  },
];

function textResult(payload, isError = false) {
  return {
    content: [{ type: "text", text: clamp(typeof payload === "string" ? payload : JSON.stringify(payload, null, 2)) }],
    isError,
  };
}

async function callTool(name, args) {
  const tool = tools.find((item) => item.name === name);
  if (!tool) return textResult({ error: `unknown tool: ${name}` }, true);
  try {
    const script = tool.build(args || {});
    const { code, value, stdout, stderr } = await runScript(script);
    if (tool.raw) {
      return textResult({ exitCode: code, output: clamp(stdout), stderr: clamp(stderr, 4000) });
    }
    if (!value) {
      return textResult(
        { exitCode: code, stdout: clamp(stdout, 4000), stderr: clamp(stderr, 4000) },
        code !== 0,
      );
    }
    if (code !== 0 && typeof value === "object") {
      return textResult({ exitCode: code, ...value, stderr: clamp(stderr, 2000) }, true);
    }
    return textResult(value);
  } catch (err) {
    return textResult({ error: String((err && err.message) || err) }, true);
  }
}

function send(message) {
  process.stdout.write(JSON.stringify(message) + "\n");
}

async function handle(request) {
  const { id, method, params } = request;
  if (id === undefined || id === null) return; // notification

  switch (method) {
    case "initialize": {
      const protocolVersion = params?.protocolVersion || "2025-06-18";
      send({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: SERVER_NAME, version: VERSION },
          instructions:
            "Browser automation through ego lite. For any browser task (open pages, read content, click, fill, screenshot, extract data), prefer these tools over other browser stacks. Efficiency: a multi-step flow belongs in ONE browser_run script (each tool call starts a fresh ego-browser process), so use the individual tools only for one-step operations. Follow the ego-browser skill guide: semantic snapshots first, screenshots only when DOM semantics are insufficient, and the ego window must not be minimized for screenshots.",
        },
      });
      return;
    }
    case "ping":
      send({ jsonrpc: "2.0", id, result: {} });
      return;
    case "tools/list":
      send({
        jsonrpc: "2.0",
        id,
        result: {
          tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
        },
      });
      return;
    case "tools/call": {
      const result = await callTool(params?.name, params?.arguments);
      send({ jsonrpc: "2.0", id, result });
      return;
    }
    case "prompts/list":
      send({ jsonrpc: "2.0", id, result: { prompts: [] } });
      return;
    case "resources/list":
      send({ jsonrpc: "2.0", id, result: { resources: [] } });
      return;
    default:
      send({
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Method not found: ${method}` },
      });
  }
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let request;
  try {
    request = JSON.parse(trimmed);
  } catch {
    send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
    return;
  }
  handle(request).catch((err) => {
    send({
      jsonrpc: "2.0",
      id: request?.id ?? null,
      error: { code: -32603, message: String((err && err.message) || err) },
    });
  });
});

rl.on("close", () => process.exit(0));
