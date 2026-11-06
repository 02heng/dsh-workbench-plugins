// bundled Python 的定位与 spawn 封装：跑 sidecar 脚本并解析单行 JSON 输出。
import { access } from "node:fs/promises"
import { constants as FS } from "node:fs"
import { spawnCapture } from "./cli.js"
import { toPosix } from "./paths.js"

export const DEFAULT_PYTHON_PATH = "C:/Users/HY/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/python/python.exe"
export const DEFAULT_TIMEOUT_MS = 120_000

export class PhotocraftPythonError extends Error {
	constructor(message, detail = {}) {
		super(message)
		this.name = "PhotocraftPythonError"
		this.script = detail.script
		this.args = detail.args
		this.code = detail.code
		this.stdout = detail.stdout
		this.stderr = detail.stderr
		this.timedOut = Boolean(detail.timedOut)
		this.aborted = Boolean(detail.aborted)
	}
}

export function resolvePythonPath(config = {}) {
	const raw = config?.pythonPath || process.env.PHOTOCRAFT_PYTHON || DEFAULT_PYTHON_PATH
	return toPosix(raw)
}

const versionCache = new Map()

export async function pythonStatus(config = {}) {
	const path = resolvePythonPath(config)
	try {
		await access(path, FS.F_OK)
	} catch {
		return { ok: false, path, error: `找不到 bundled python：${path}` }
	}
	if (!versionCache.has(path)) {
		const result = await spawnCapture(path, ["--version"], { timeoutMs: 15_000 })
		versionCache.set(path, result.code === 0
			? String(result.stdout || result.stderr).trim().split(/\r?\n/)[0]
			: null)
	}
	const version = versionCache.get(path)
	return version ? { ok: true, path, version } : { ok: true, path, version: null, warn: "python --version 未返回版本" }
}

/**
 * 运行 sidecar 脚本，返回解析后的 JSON 对象。
 * 契约：脚本失败时也应输出 {"ok":false,"error":"…"} 且退出码 0；退出码非 0 视为崩溃并抛错。
 */
export async function runPythonJson(options = {}) {
	const pythonPath = resolvePythonPath(options)
	const script = options.script ? toPosix(options.script) : ""
	if (!script) throw new Error("runPythonJson 需要 script 路径")
	try {
		await access(script, FS.F_OK)
	} catch {
		throw new PhotocraftPythonError(`sidecar 脚本不存在：${script}（pc-sidecar 可能尚未落地）`, { script })
	}
	const args = [script, ...(options.args ?? []).map((value) => (typeof value === "string" ? value : String(value)))]
	const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : DEFAULT_TIMEOUT_MS
	const started = Date.now()
	const result = await spawnCapture(pythonPath, args, { timeoutMs, signal: options.signal, cwd: options.cwd })
	if (result.code !== 0) {
		const detail = String(result.stderr || result.stdout).trim().slice(0, 800)
		throw new PhotocraftPythonError(`${script} 退出码 ${result.code}：${detail || "无输出"}`, { ...result, script, args })
	}
	const parsed = lastJsonLine(result.stdout)
	if (parsed === null) {
		throw new PhotocraftPythonError(`${script} 没有输出合法 JSON：${String(result.stdout).trim().slice(0, 400) || "空输出"}`, { ...result, script, args })
	}
	return { ...parsed, seconds: (Date.now() - started) / 1000 }
}

/** 取 stdout 里最后一个能解析成 JSON 对象的行（容忍脚本的调试行）。 */
export function lastJsonLine(stdout) {
	const lines = String(stdout ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
	for (let i = lines.length - 1; i >= 0; i--) {
		if (!lines[i].startsWith("{")) continue
		try {
			return JSON.parse(lines[i])
		} catch {
			// 继续往前找
		}
	}
	const whole = String(stdout ?? "").trim()
	if (whole.startsWith("{")) {
		try {
			return JSON.parse(whole)
		} catch {
			return null
		}
	}
	return null
}
