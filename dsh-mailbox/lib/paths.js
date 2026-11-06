import { homedir } from "node:os";
import { basename, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const PLUGIN_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
export const DEFAULT_PYTHON_PATH = "C:/Users/HY/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/python/python.exe";

export function toPosix(value) {
  return String(value ?? "").replace(/\\/g, "/");
}

export function resolveRoot(config = {}) {
  const raw = String(config?.root ?? "").trim();
  return resolve(raw || join(homedir(), ".dsh", "mailbox"));
}

export function sidecarScript(name, _config) {
  return join(PLUGIN_ROOT, "sidecar", name);
}

export function timestamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

export function sanitizeName(name, fallback = "file", maxLength = 90) {
  let out = String(name ?? "")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .replace(/[. ]+$/g, "")
    .trim();
  if (!out) out = fallback;
  const ext = extname(out);
  const stem = basename(out, ext);
  if (WINDOWS_RESERVED.test(stem)) out = `_${out}`;
  if (out.length > maxLength) {
    const keep = Math.max(1, maxLength - ext.length);
    out = stem.slice(0, keep) + ext;
  }
  return out;
}

export function emitLog(logger, level, text) {
  const sink = logger?.[level];
  if (typeof sink === "function") {
    try { sink.call(logger, `[mailbox] ${text}`); return; }
    catch { /* fall through to console */ }
  }
  const fn = level === "warn" ? console.warn : level === "error" ? console.error : console.log;
  fn(`[mailbox] ${text}`);
}
