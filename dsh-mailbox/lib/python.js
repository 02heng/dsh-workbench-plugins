import { spawn } from "node:child_process";
import { DEFAULT_PYTHON_PATH } from "./paths.js";

export function pythonPathOf(config = {}) {
  return String(config?.pythonPath ?? "").trim() || DEFAULT_PYTHON_PATH;
}

export function lastJsonLine(stdout) {
  const lines = String(stdout ?? "").split(/\r?\n/).filter((line) => line.trim());
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index].trim();
    if (!line.startsWith("{") && !line.startsWith("[")) continue;
    try { return JSON.parse(line); } catch { /* keep scanning */ }
  }
  return undefined;
}

export function spawnCapture(command, args, options = {}) {
  const { cwd, timeoutMs = 180000, signal, env, onStderr } = options;
  return new Promise((resolvePromise, reject) => {
    let child;
    try {
      child = spawn(command, args, { cwd, windowsHide: true, env: { ...process.env, ...env } });
    } catch (error) {
      reject(error);
      return;
    }
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (signal) signal.removeEventListener?.("abort", onAbort);
      if (error) reject(error); else resolvePromise(value);
    };
    const timer = setTimeout(() => {
      try { child.kill(); } catch { /* ignore */ }
      const error = new Error(`命令超时（${timeoutMs}ms）：${command}`);
      error.stdout = stdout;
      error.stderr = stderr;
      finish(error);
    }, Math.max(1000, Number(timeoutMs) || 180000));
    const onAbort = () => {
      try { child.kill(); } catch { /* ignore */ }
      const error = new Error("命令已取消");
      error.stdout = stdout;
      error.stderr = stderr;
      finish(error);
    };
    if (signal) {
      if (signal.aborted) { onAbort(); return; }
      signal.addEventListener?.("abort", onAbort, { once: true });
    }
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => { stdout += chunk; if (stdout.length > 8_000_000) stdout = stdout.slice(-4_000_000); });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
      if (stderr.length > 800_000) stderr = stderr.slice(-400_000);
      if (typeof onStderr === "function") { try { onStderr(chunk); } catch { /* ignore */ } }
    });
    child.on("error", (error) => finish(error));
    child.on("close", (code) => {
      if (code === 0) { finish(null, { stdout, stderr, code }); return; }
      const detail = String(stderr || stdout || "").trim().split(/\r?\n/).slice(-12).join("\n");
      const error = new Error(`python 退出码 ${code}：${detail || "(无输出)"}`);
      error.stdout = stdout;
      error.stderr = stderr;
      error.code = code;
      finish(error);
    });
  });
}

export async function runPythonJson({ script, args = [], timeoutMs, signal, cwd, pythonPath, env, onStderr }) {
  const result = await spawnCapture(pythonPath, ["-u", script, ...args.map((value) => String(value))], {
    cwd, timeoutMs, signal, env, onStderr,
  });
  const parsed = lastJsonLine(result.stdout);
  if (parsed === undefined) {
    const error = new Error(`sidecar 未输出 JSON：${script}`);
    error.stdout = result.stdout;
    error.stderr = result.stderr;
    throw error;
  }
  return parsed;
}
