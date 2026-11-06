import z from "@deepseek-ai/schemastery";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  addRule, ensureRoot, loadConfig, loadSecret, loadState, publicStatus,
  redactConfig, saveConfig, saveSecret, saveState, mergeDeep, DEFAULT_CONFIG,
} from "./config.js";
import { registerWorkbench } from "./http.js";
import { emitLog, resolveRoot, sidecarScript, timestamp } from "./paths.js";
import { pythonPathOf, runPythonJson } from "./python.js";

export const name = "dsh-mailbox";
export const inject = ["tools"];

export const Config = z.object({
  root: z.string().default("D:/dsh-mailbox"),
  pythonPath: z.string().default(""),
  timeoutMs: z.number().default(180000),
  autoSchedule: z.boolean().default(true),
});

const WEB_SERVER_KEYS = ["webServer", "httpServer"];

function textRender(value) {
  return [{ type: "text", text: JSON.stringify(value, null, 2) }];
}

function tool(spec) {
  return defineTool({
    output: { schema: { type: "object", additionalProperties: true }, render: (_args, value) => textRender(value) },
    ...spec,
  });
}

function resolveRootOf(config) {
  return resolveRoot(config ?? {});
}

async function ensureReady(config) {
  const root = resolveRootOf(config);
  await ensureRoot(root);
  try {
    await loadConfig(root);
  } catch (error) {
    emitLog(config?.logger, "warn", "读取配置失败：" + String(error));
  }
  return root;
}

async function runSidecar(config, script, args = [], exec = undefined) {
  const root = await ensureReady(config);
  return runPythonJson({
    script: sidecarScript(script, config),
    args: ["--root", root, ...args],
    timeoutMs: Number(config?.timeoutMs) || 180000,
    pythonPath: pythonPathOf(config),
    cwd: root,
    signal: exec?.signal,
    env: { PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" },
  });
}

async function scan(config, args = [], exec) {
  const flags = [];
  if (args.test) flags.push("--test");
  if (args.limit) flags.push("--limit", String(args.limit));
  if (args.sinceDate) flags.push("--since-date", String(args.sinceDate));
  if (args.folder) flags.push("--folder", String(args.folder));
  if (args.all) flags.push("--all");
  return runSidecar(config, "mail_fetch.py", flags, exec);
}

async function organize(config, args = {}, exec) {
  const flags = [];
  if (args.dryRun) flags.push("--dry-run");
  if (args.limit) flags.push("--limit", String(args.limit));
  if (args.uid) flags.push("--uid", String(args.uid));
  return runSidecar(config, "mail_organize.py", flags, exec);
}

async function pipeline(config, args = {}, exec) {
  const root = await ensureReady(config);
  const fetched = await scan(config, args, exec);
  const organized = await organize(config, args, exec);
  const state = await loadState(root);
  state.lastRunAt = new Date().toISOString();
  state.lastRunResult = {
    scanned: fetched?.newCount ?? 0,
    processed: organized?.processed ?? 0,
    organized: organized?.organized ?? 0,
    needsHuman: organized?.needsHuman ?? 0,
  };
  await saveState(root, state);
  return { ok: Boolean(fetched?.ok !== false && organized?.ok !== false), fetched, organized, finishedAt: timestamp() };
}

export function apply(ctx, config = {}) {
  const pluginConfig = { ...config };

  const statusTool = tool({
    name: "mailbox_status",
    description: "查看收件自动化状态：邮箱是否已配置、通知规则、上次收取/归档结果、待整理邮件数、台账路径。",
    parameters: {},
    async execute() {
      const root = await ensureReady(pluginConfig);
      const cfg = await loadConfig(root);
      const secret = await loadSecret(root);
      const state = await loadState(root);
      let pending = 0;
      try {
        const raw = await readFile(join(root, "raw", "index.json"), "utf8");
        const index = JSON.parse(raw);
        const mails = Array.isArray(index?.mails) ? index.mails : [];
        pending = mails.filter((item) => item && item.status === "fetched").length;
      } catch { /* 没有收过信 */ }
      return {
        ok: true,
        root,
        status: publicStatus(cfg, secret, state),
        pendingMails: pending,
        rules: (cfg.rules ?? []).map((rule) => ({
          id: rule.id, name: rule.name, enabled: rule.enabled !== false,
          keywords: rule.keywords ?? [], target: rule.target ?? "", bySchool: rule.bySchool !== false,
        })),
        paths: {
          ledger: join(root, "ledger"),
          raw: join(root, "raw"),
          inbox: join(root, "inbox"),
          workbench: "/plugins/dsh-mailbox/",
        },
        hints: [
          secret.password ? "" : "还没填邮箱授权码：打开网页工作台 /plugins/dsh-mailbox/ 填写（126 邮箱需在网页版开通 IMAP 并生成「客户端授权码」）",
          (cfg.rules ?? []).length ? "" : "还没有通知规则：在工作台添加规则（关键词 + 落盘目录），否则邮件会进 inbox/待人工",
        ].filter(Boolean),
      };
    },
  });

  const configTool = tool({
    name: "mailbox_config",
    description: "读写邮箱收件配置。可用于：修改邮箱/路径/命名/解压参数（patch，深合并）、保存授权码（password，只落本地 secret.json）、新增或修改通知规则（rule）。",
    parameters: {
      patch: { type: "object", description: "要深合并进 config.json 的配置片段" },
      password: { type: "string", description: "邮箱授权码（126 的客户端授权码）；只写入 secret.json，不回显" },
      rule: { type: "object", description: "通知规则 {id,name,keywords,target,bySchool,prefixSchool}" },
      removeRule: { type: "string", description: "要删除的规则 id" },
    },
    async execute(args) {
      const root = await ensureReady(pluginConfig);
      let cfg = await loadConfig(root);
      const changed = [];
      if (args?.patch && typeof args.patch === "object") {
        cfg = mergeDeep(cfg, args.patch);
        changed.push("patch");
      }
      if (args?.rule && typeof args.rule === "object") {
        cfg = addRule(cfg, args.rule);
        changed.push("rule:" + (args.rule.id ?? "(auto)"));
      }
      if (args?.removeRule) {
        cfg = { ...cfg, rules: (cfg.rules ?? []).filter((item) => item.id !== String(args.removeRule)) };
        changed.push("removeRule:" + args.removeRule);
      }
      if (changed.length) await saveConfig(root, cfg);
      if (args?.password) {
        await saveSecret(root, { password: String(args.password) });
        changed.push("password");
      }
      const secret = await loadSecret(root);
      return {
        ok: true, root, changed,
        status: publicStatus(cfg, secret, await loadState(root)),
        note: changed.includes("password") ? "授权码已保存到本地 secret.json（不写入对话与记忆）" : undefined,
      };
    },
  });

  const scanTool = tool({
    name: "mailbox_scan",
    description: "通过 IMAP 收取新邮件（不整理归档）：拉取附件与正文到 raw/，识别命中的通知规则。test=true 只测试连接与登录。",
    parameters: {
      limit: { type: "number", description: "本次最多收几封，默认 40" },
      test: { type: "boolean", description: "只测试连接/登录，不下载" },
      sinceDate: { type: "string", description: "只收该日期之后的邮件，YYYY-MM-DD" },
      folder: { type: "string", description: "邮箱文件夹，默认 INBOX" },
      all: { type: "boolean", description: "首次收信也收历史邮件（默认只收最近 7 天）" },
    },
    async execute(args, exec) {
      return scan(pluginConfig, args ?? {}, exec);
    },
  });

  const processTool = tool({
    name: "mailbox_process",
    description: "把已收取的邮件整理归档：按通知规则建学校子目录、解压压缩包、规范化命名、写收件台账与缺件清单。dryRun=true 只预览不落盘。",
    parameters: {
      dryRun: { type: "boolean", description: "只预览将要做的动作" },
      limit: { type: "number", description: "本次最多处理几封，默认 50" },
      uid: { type: "string", description: "只处理指定邮件 UID" },
    },
    async execute(args, exec) {
      return organize(pluginConfig, args ?? {}, exec);
    },
  });

  const runTool = tool({
    name: "mailbox_run",
    description: "一键收取：先 IMAP 收新邮件，再整理归档并更新台账。定时任务与手动都用这一条。",
    parameters: {
      limit: { type: "number", description: "本次最多处理几封" },
      dryRun: { type: "boolean", description: "只预览归档结果" },
    },
    async execute(args, exec) {
      return pipeline(pluginConfig, args ?? {}, exec);
    },
  });

  const ledgerTool = tool({
    name: "mailbox_ledger",
    description: "读取指定月份的收件台账（xlsx）为表格数据，可核对哪些学校已交、哪些待人工。",
    parameters: {
      month: { type: "string", description: "月份 YYYY-MM，默认本月" },
      limit: { type: "number", description: "最多返回行数，默认 300" },
    },
    async execute(args) {
      const flags = [];
      if (args?.month) flags.push("--month", String(args.month));
      if (args?.limit) flags.push("--limit", String(args.limit));
      return runSidecar(pluginConfig, "mail_ledger.py", flags);
    },
  });

  const sendTool = tool({
    name: "mailbox_send",
    description: "按计划文件批量发信（默认干跑，出回执草稿；send=true 才真正投递）。计划文件为 JSON：{subject, body, attachments, recipients:[{to,name,fields}]}。",
    parameters: {
      planPath: { type: "string", required: true, description: "计划文件路径" },
      send: { type: "boolean", description: "true 才真正投递（默认干跑）" },
      limit: { type: "number", description: "最多发给几人，默认 80" },
    },
    async execute(args, exec) {
      const flags = ["--plan", String(args.planPath)];
      if (args.send) flags.push("--send");
      if (args.limit) flags.push("--limit", String(args.limit));
      return runSidecar(pluginConfig, "mail_send.py", flags, exec);
    },
  });

  const selftestTool = tool({
    name: "mailbox_selftest",
    description: "离线自检（不联网、不需要真实邮箱）：脱敏、文件名、GBK 解压、学校识别、归档落盘、台账生成。",
    parameters: {},
    async execute() {
      return runSidecar(pluginConfig, "selftest.py", ["--work", join(resolveRootOf(pluginConfig), "selftest"), "--clean", "1"]);
    },
  });

  for (const item of [statusTool, configTool, scanTool, processTool, runTool, ledgerTool, sendTool, selftestTool]) {
    ctx.tools.register(item);
  }

  // ---- 网页工作台 ----
  const registerWebSurface = () => {
    for (const key of WEB_SERVER_KEYS) {
      let service;
      try {
        service = ctx.reflect?.get?.(key, false) ?? ctx.get?.(key);
      } catch { service = undefined; }
      if (!service || typeof service.register !== "function") continue;
      ctx.effect(() => registerWorkbench(service, {
        root: resolveRootOf(pluginConfig),
        pluginConfig,
        pythonPath: pythonPathOf(pluginConfig),
        timeoutMs: Number(pluginConfig?.timeoutMs) || 180000,
      }), "dsh-mailbox.workbench:" + key);
      emitLog(ctx.logger, "info", "网页工作台已挂载 /plugins/dsh-mailbox/");
      return;
    }
  };
  registerWebSurface();
  ctx.on("internal/service", (serviceName) => {
    if (WEB_SERVER_KEYS.includes(serviceName)) registerWebSurface();
  });
  ctx.on("ready", registerWebSurface);

  // ---- 定时收信（本机进程内，DSH 运行期间生效）----
  const state = { running: false, timer: null, slot: "" };
  const tick = async () => {
    if (state.running) return;
    const root = resolveRootOf(pluginConfig);
    let cfg;
    let secret;
    try {
      cfg = await loadConfig(root);
      secret = await loadSecret(root);
    } catch { return; }
    const schedule = cfg.schedule ?? {};
    if (schedule.enabled === false || !Array.isArray(schedule.times) || !schedule.times.length) return;
    if (!secret.password) return;
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const hhmm = pad(now.getHours()) + ":" + pad(now.getMinutes());
    if (!schedule.times.includes(hhmm)) return;
    const daySlot = now.toISOString().slice(0, 10) + " " + hhmm;
    const saved = await loadState(root);
    const fired = saved?.autoSlots ?? [];
    if (fired.includes(daySlot)) return;
    state.running = true;
    try {
      const result = await pipeline(pluginConfig, {});
      const next = await loadState(root);
      next.autoSlots = [...fired.slice(-30), daySlot];
      next.lastAutoRunAt = new Date().toISOString();
      next.lastAutoResult = result.lastRunResult ?? null;
      await saveState(root, next);
      const fetchedCount = result?.fetched?.newCount ?? 0;
      const organizedCount = result?.organized?.organized ?? 0;
      const needsHumanCount = result?.organized?.needsHuman ?? 0;
      emitLog(ctx.logger, "info", "定时收信完成：新收 " + fetchedCount + " 封，归档 " + organizedCount + " 封");
      const notifier = ctx.get?.("notification");
      if (cfg.notify?.onFinish !== false && notifier && typeof notifier.notify === "function") {
        try {
          await notifier.notify({
            title: "邮箱自动收取完成",
            body: "新收 " + fetchedCount + " 封，归档 " + organizedCount + " 封，待人工 " + needsHumanCount + " 封",
          });
        } catch { /* 通知非关键 */ }
      }
    } catch (error) {
      emitLog(ctx.logger, "warn", "定时收信失败：" + String(error?.message ?? error));
    } finally {
      state.running = false;
    }
  };
  ctx.effect(() => {
    if (pluginConfig.autoSchedule === false) return () => {};
    state.timer = setInterval(() => { tick(); }, 60_000);
    if (typeof state.timer.unref === "function") state.timer.unref();
    return () => { if (state.timer) clearInterval(state.timer); };
  }, "dsh-mailbox.schedule");
}

export { DEFAULT_CONFIG, redactConfig };
