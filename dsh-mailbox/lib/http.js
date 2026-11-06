import { readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  addRule, ensureRoot, loadConfig, loadSecret, loadState, publicStatus,
  redactConfig, saveConfig, saveSecret, mergeDeep,
} from "./config.js";
import { sidecarScript } from "./paths.js";
import { pythonPathOf, runPythonJson } from "./python.js";

const here = fileURLToPath(new URL(".", import.meta.url));
const UI_DIR = resolve(here, "ui");
export const BASE = "/plugins/dsh-mailbox";
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" };

function json(res, status, body) {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(payload);
}

function messageOf(error) {
  return String(error?.message ?? error);
}

function parseUrl(req) {
  try { return new URL(req.url ?? "/", "http://127.0.0.1"); }
  catch { return new URL("http://127.0.0.1/"); }
}

async function readBody(req, limit = 2_000_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error("请求体过大");
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) return {};
  try { return JSON.parse(text); } catch { throw new Error("请求体不是合法 JSON"); }
}

function sameOrigin(req) {
  const origin = req.headers?.origin;
  if (!origin) return true;
  try {
    const host = req.headers?.host ?? "";
    return new URL(origin).host === host;
  } catch { return false; }
}

async function serveUi(res, file, method = "GET") {
  try {
    const info = await stat(file);
    if (!info.isFile()) throw new Error("not a file");
    const data = await readFile(file);
    res.writeHead(200, {
      "content-type": MIME[file.slice(file.lastIndexOf("."))] ?? "application/octet-stream",
      "content-length": data.length,
      "cache-control": "no-cache",
    });
    if (method === "HEAD") res.end(); else res.end(data);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("not found");
  }
}

export function registerWorkbench(webServer, options = {}) {
  const rootDir = resolve(String(options.root ?? "D:/dsh-mailbox"));
  const pythonPath = options.pythonPath || pythonPathOf(options.pluginConfig ?? {});
  const timeoutMs = Number(options.timeoutMs) || 180000;
  const stops = [];

  const register = (path, handler) => {
    if (!webServer || typeof webServer.register !== "function") return;
    stops.push(webServer.register({ kind: "exact", path, handler }));
  };

  const runSidecar = (script, args = [], signal) => runPythonJson({
    script: sidecarScript(script),
    args: ["--root", rootDir, ...args],
    timeoutMs,
    pythonPath,
    cwd: rootDir,
    signal,
    env: { PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" },
  });

  const guardPost = (handler) => async (req, res) => {
    if (!sameOrigin(req)) { json(res, 403, { error: "跨站请求已拒绝" }); return; }
    try {
      const body = await readBody(req);
      const result = await handler(body, req, res);
      if (!res.writableEnded) json(res, 200, result);
    } catch (error) {
      json(res, 400, { error: messageOf(error) });
    }
  };

  const statusPayload = async () => {
    await ensureRoot(rootDir);
    const [config, secret, state] = await Promise.all([loadConfig(rootDir), loadSecret(rootDir), loadState(rootDir)]);
    let pending = 0;
    try {
      const index = JSON.parse(await readFile(join(rootDir, "raw", "index.json"), "utf8"));
      pending = (index?.mails ?? []).filter((item) => item?.status === "fetched").length;
    } catch { /* 未收过信 */ }
    return {
      ok: true,
      root: rootDir,
      status: publicStatus(config, secret, state),
      pendingMails: pending,
      rules: config.rules ?? [],
      schedule: config.schedule ?? {},
      ledgerDir: join(rootDir, "ledger"),
      ledgerMonth: new Date().toISOString().slice(0, 7),
    };
  };

  register(BASE, async (_req, res) => {
    res.writeHead(302, { location: BASE + "/" });
    res.end();
  });
  const page = (file) => async (req, res) => {
    const method = String(req.method ?? "GET").toUpperCase();
    if (method !== "GET" && method !== "HEAD") {
      res.writeHead(405, { "content-type": "text/plain; charset=utf-8" });
      res.end("GET only");
      return;
    }
    await serveUi(res, join(UI_DIR, file), method);
  };
  register(BASE + "/", page("index.html"));
  register(BASE + "/index.html", page("index.html"));
  register(BASE + "/app.js", page("app.js"));
  register(BASE + "/style.css", page("style.css"));
  register(BASE + "/favicon.ico", async (_req, res) => { res.writeHead(204); res.end(); });

  register(BASE + "/api/status", async (_req, res) => {
    try { json(res, 200, await statusPayload()); } catch (error) { json(res, 500, { error: messageOf(error) }); }
  });

  register(BASE + "/api/config", async (req, res) => {
    if (String(req.method).toUpperCase() === "GET") {
      try {
        const [config, secret] = await Promise.all([loadConfig(rootDir), loadSecret(rootDir)]);
        json(res, 200, { ok: true, config: redactConfig(config, secret) });
      } catch (error) { json(res, 500, { error: messageOf(error) }); }
      return;
    }
    await guardPost(async (body) => {
      let config = await loadConfig(rootDir);
      const changed = [];
      if (body.patch && typeof body.patch === "object") { config = mergeDeep(config, body.patch); changed.push("patch"); }
      if (body.rule && typeof body.rule === "object") { config = addRule(config, body.rule); changed.push("rule"); }
      if (body.removeRule) {
        config = { ...config, rules: (config.rules ?? []).filter((item) => item.id !== String(body.removeRule)) };
        changed.push("removeRule");
      }
      if (changed.length) await saveConfig(rootDir, config);
      if (body.password) await saveSecret(rootDir, { password: String(body.password) });
      const secret = await loadSecret(rootDir);
      return { ok: true, changed, status: publicStatus(config, secret, await loadState(rootDir)), config: redactConfig(config, secret) };
    })(req, res);
  });

  register(BASE + "/api/test", guardPost(async () => runSidecar("mail_fetch.py", ["--test"])));
  register(BASE + "/api/scan", guardPost(async (body) => {
    const args = [];
    if (body.limit) args.push("--limit", String(body.limit));
    if (body.sinceDate) args.push("--since-date", String(body.sinceDate));
    if (body.all) args.push("--all");
    return runSidecar("mail_fetch.py", args);
  }));
  register(BASE + "/api/process", guardPost(async (body) => {
    const args = [];
    if (body.dryRun) args.push("--dry-run");
    if (body.limit) args.push("--limit", String(body.limit));
    return runSidecar("mail_organize.py", args);
  }));
  register(BASE + "/api/run", guardPost(async (body) => {
    const args = [];
    if (body.limit) args.push("--limit", String(body.limit));
    const fetched = await runSidecar("mail_fetch.py", args);
    const organized = await runSidecar("mail_organize.py", body.dryRun ? ["--dry-run"] : []);
    return { ok: true, fetched, organized };
  }));
  register(BASE + "/api/ledger", async (req, res) => {
    try {
      const month = parseUrl(req).searchParams.get("month") ?? "";
      json(res, 200, await runSidecar("mail_ledger.py", month ? ["--month", month] : []));
    } catch (error) { json(res, 400, { error: messageOf(error) }); }
  });
  register(BASE + "/api/selftest", guardPost(async () => runSidecar("selftest.py", ["--work", join(rootDir, "selftest"), "--clean", "1"])));
  register(BASE + "/api/logs", async (req, res) => {
    try {
      const tail = Number(parseUrl(req).searchParams.get("tail") ?? 120) || 120;
      const text = await readFile(join(rootDir, "logs", "mailbox.log"), "utf8");
      json(res, 200, { ok: true, lines: text.trim().split(/\r?\n/).slice(-tail) });
    } catch {
      json(res, 200, { ok: true, lines: [] });
    }
  });

  return () => {
    for (const stop of stops) {
      try { stop(); } catch { /* ignore */ }
    }
  };
}
