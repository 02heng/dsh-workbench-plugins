import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PLUGIN_ROOT, DEFAULT_PYTHON_PATH } from "../lib/paths.js";
import { runPythonJson } from "../lib/python.js";
import { register } from "node:module";

register("./loader.mjs", import.meta.url);
const { registerWorkbench, BASE } = await import("../lib/http.js");
const plugin = await import("../lib/index.js");

const here = dirname(fileURLToPath(import.meta.url));
const TMP = resolve(here, ".e2e");
const PYTHON = process.env.MAILBOX_PYTHON || DEFAULT_PYTHON_PATH;
const results = [];

async function check(name, work) {
  try {
    await work();
    results.push({ name, pass: true });
  } catch (error) {
    results.push({ name, pass: false, detail: String(error?.message ?? error) });
  }
}

function makeReq({ method = "GET", url = "/", headers = {}, body = null } = {}) {
  const chunks = body === null ? [] : [Buffer.from(typeof body === "string" ? body : JSON.stringify(body))];
  const req = Readable.from(chunks);
  req.method = method;
  req.url = url;
  req.headers = headers;
  return req;
}

function makeRes() {
  return {
    statusCode: 0, headers: {}, body: "", writableEnded: false,
    writeHead(code, headers) { this.statusCode = code; this.headers = { ...(headers ?? {}) }; return this; },
    end(chunk) {
      if (chunk !== undefined && chunk !== null) {
        this.body += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
      }
      this.writableEnded = true;
    },
  };
}

const routes = new Map();
const server = { register({ path, handler }) { routes.set(path, handler); return () => routes.delete(path); } };
const dispose = registerWorkbench(server, { root: TMP, pythonPath: PYTHON, timeoutMs: 120000 });

async function call(path, options = {}) {
  const handler = routes.get(path.split("?")[0]);
  assert.ok(handler, "路由未注册：" + path);
  const res = makeRes();
  await handler(makeReq({ url: path, ...options }), res);
  return res;
}

async function jsonOf(path, options) {
  const res = await call(path, options);
  return { res, data: JSON.parse(res.body || "{}") };
}

console.log("== dsh-mailbox e2e ==");
await rm(TMP, { recursive: true, force: true });
await mkdir(TMP, { recursive: true });

await check("package.json 声明 bundle 与 web 客户端", async () => {
  const pkg = JSON.parse(await readFile(join(PLUGIN_ROOT, "package.json"), "utf8"));
  assert.equal(pkg.name, "dsh-mailbox");
  assert.equal(pkg.type, "module");
  assert.equal(pkg.dsh?.bundle?.patch, "./cordis.patch.yml");
  assert.equal(pkg.dsh?.client?.platform?.includes("web"), true);
});

await check("sidecar 与网页 UI 文件齐全", async () => {
  for (const file of [
    "cordis.patch.yml", "sidecar/mb_common.py", "sidecar/mail_fetch.py", "sidecar/mail_unpack.py",
    "sidecar/mail_organize.py", "sidecar/mail_ledger.py", "sidecar/mail_send.py", "sidecar/selftest.py",
    "lib/ui/index.html", "lib/ui/app.js", "lib/ui/style.css",
  ]) {
    const info = await stat(join(PLUGIN_ROOT, file));
    assert.ok(info.size > 0, file + " 为空");
  }
});

await check("离线自检 21/21 通过（sidecar）", async () => {
  const data = await runPythonJson({
    script: join(PLUGIN_ROOT, "sidecar", "selftest.py"),
    args: ["--root", join(TMP, "selftest"), "--clean", "1"],
    timeoutMs: 120000,
    pythonPath: PYTHON,
    env: { PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" },
  });
  assert.equal(data.ok, true, JSON.stringify(data.checks?.filter((item) => !item.pass)));
  assert.ok(data.total >= 21, "自检项数量异常：" + data.total);
  assert.equal(data.passed, data.total);
});

const registered = new Map();
const fakeCtx = {
  tools: { register(tool) { registered.set(tool.name, tool); } },
  effect(factory) { return factory(); },
  on() {},
  get() { return undefined; },
  reflect: undefined,
  logger: undefined,
};
plugin.apply(fakeCtx, { root: TMP, autoSchedule: false });

await check("注册 8 个工具", async () => {
  assert.deepEqual([...registered.keys()].sort(), [
    "mailbox_config", "mailbox_ledger", "mailbox_process", "mailbox_run",
    "mailbox_scan", "mailbox_selftest", "mailbox_send", "mailbox_status",
  ]);
});

await check("工作台 16 条路由全部注册", async () => {
  const expected = [
    BASE, BASE + "/", BASE + "/index.html", BASE + "/app.js", BASE + "/style.css", BASE + "/favicon.ico",
    BASE + "/api/status", BASE + "/api/config", BASE + "/api/test", BASE + "/api/scan",
    BASE + "/api/process", BASE + "/api/run", BASE + "/api/ledger", BASE + "/api/selftest", BASE + "/api/logs",
  ];
  for (const path of expected) assert.ok(routes.has(path), "缺路由 " + path);
});

await check("GET / 返回工作台页面", async () => {
  const res = await call(BASE + "/");
  assert.equal(res.statusCode, 200);
  assert.match(res.headers["content-type"], /text\/html/);
  assert.match(res.body, /邮箱收件台/);
  assert.match(res.body, /scheduleTimes/);
});

await check("GET /style.css 与 /favicon.ico", async () => {
  const css = await call(BASE + "/style.css");
  assert.equal(css.statusCode, 200);
  assert.match(css.headers["content-type"], /text\/css/);
  const icon = await call(BASE + "/favicon.ico");
  assert.equal(icon.statusCode, 204);
});

await check("GET /api/status 返回默认配置", async () => {
  const { res, data } = await jsonOf(BASE + "/api/status");
  assert.equal(res.statusCode, 200);
  assert.equal(data.ok, true);
  assert.equal(data.status.configured, false);
  assert.deepEqual(data.schedule.times, ["08:30", "17:00"]);
  assert.equal(Array.isArray(data.rules), true);
});

await check("POST 跨站请求被拒绝", async () => {
  const { res, data } = await jsonOf(BASE + "/api/config", {
    method: "POST",
    headers: { origin: "https://evil.example.com", host: "127.0.0.1:59768" },
    body: { patch: { fallbackTarget: "x" } },
  });
  assert.equal(res.statusCode, 403);
  assert.match(data.error, /跨站/);
});

await check("POST /api/config 保存规则与路径并能回读", async () => {
  const saved = await jsonOf(BASE + "/api/config", {
    method: "POST",
    headers: { host: "127.0.0.1:59768" },
    body: {
      patch: {
        paths: { archiveRoot: join(TMP, "archive") },
        rules: [{
          id: "rule-e2e", name: "课间一刻钟", keywords: ["课间一刻钟", "一刻钟"],
          target: join(TMP, "archive", "课间一刻钟"), bySchool: true, enabled: true,
        }],
      },
    },
  });
  assert.equal(saved.res.statusCode, 200);
  assert.equal(saved.data.ok, true);
  assert.equal(saved.data.config.rules.length, 1);

  const read = await jsonOf(BASE + "/api/config");
  assert.equal(read.data.config.rules[0].id, "rule-e2e");
  assert.deepEqual(read.data.config.rules[0].keywords, ["课间一刻钟", "一刻钟"]);
  assert.equal(read.data.config.paths.archiveRoot, join(TMP, "archive"));
  assert.equal(read.data.config.mailbox.address, "example@126.com");
});

await check("GET /api/logs 无日志时返回空数组", async () => {
  const { res, data } = await jsonOf(BASE + "/api/logs?tail=20");
  assert.equal(res.statusCode, 200);
  assert.equal(data.ok, true);
  assert.equal(Array.isArray(data.lines), true);
});

await check("GET /api/ledger 空台账可用", async () => {
  const { res, data } = await jsonOf(BASE + "/api/ledger");
  assert.equal(res.statusCode, 200);
  assert.equal(data.ok, true);
  assert.equal(data.count, 0);
  assert.equal(Array.isArray(data.headers), true);
});

await check("POST /api/selftest 经 HTTP 链路通过", async () => {
  const { res, data } = await jsonOf(BASE + "/api/selftest", { method: "POST", headers: { host: "x" }, body: {} });
  assert.equal(res.statusCode, 200);
  assert.equal(data.ok, true);
  assert.equal(data.passed, data.total);
});

await check("mailbox_status 工具可执行", async () => {
  const tool = registered.get("mailbox_status");
  const data = await tool.execute({});
  assert.equal(data.ok, true);
  assert.equal(data.pendingMails, 0);
  assert.equal(data.paths.workbench, BASE + "/");
  assert.equal(data.status.configured, false);
  assert.equal(data.rules.length, 1);
});

await check("mailbox_config 工具写入授权码但不回显", async () => {
  const tool = registered.get("mailbox_config");
  const data = await tool.execute({ password: "e2e-not-a-real-password" });
  assert.equal(data.ok, true);
  assert.equal(data.changed.includes("password"), true);
  assert.equal(JSON.stringify(data).includes("e2e-not-a-real-password"), false);
  const secret = JSON.parse(await readFile(join(TMP, "secret.json"), "utf8"));
  assert.equal(secret.password, "e2e-not-a-real-password");
});

await check("mailbox_selftest 工具可执行", async () => {
  const tool = registered.get("mailbox_selftest");
  const data = await tool.execute({});
  assert.equal(data.ok, true);
  assert.equal(data.passed, data.total);
});

dispose();
await rm(TMP, { recursive: true, force: true });

const failures = results.filter((item) => !item.pass);
console.log(JSON.stringify({
  ok: failures.length === 0,
  passed: results.length - failures.length,
  total: results.length,
  failures,
  checks: results.map((item) => item.pass ? "✓ " + item.name : "✗ " + item.name + " — " + item.detail),
}, null, 2));
process.exit(failures.length === 0 ? 0 : 1);
