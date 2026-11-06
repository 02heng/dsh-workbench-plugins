// photocraft-cli.exe 的定位与 spawn 封装：run / info / batch / commands / --version。
// 一律 spawn + 参数数组，绝不 shell 拼接；统一支持 timeout 与 AbortSignal 中止。
import { spawn } from "node:child_process"
import { access } from "node:fs/promises"
import { constants as FS } from "node:fs"
import { toPosix } from "./paths.js"

export const DEFAULT_CLI_PATH = "D:/PS-V/photocraft-cli.exe"
export const DEFAULT_TIMEOUT_MS = 120_000

export class PhotocraftCliError extends Error {
	constructor(message, detail = {}) {
		super(message)
		this.name = "PhotocraftCliError"
		this.command = detail.command
		this.args = detail.args
		this.code = detail.code
		this.stdout = detail.stdout
		this.stderr = detail.stderr
		this.timedOut = Boolean(detail.timedOut)
		this.aborted = Boolean(detail.aborted)
	}
}

export function resolveCliPath(config = {}) {
	const raw = config?.cliPath || process.env.PHOTOCRAFT_CLI || DEFAULT_CLI_PATH
	return toPosix(raw)
}

/** 底层 spawn：返回 {code, stdout, stderr, timedOut, aborted, error}，不抛异常。 */
export function spawnCapture(exe, args, { timeoutMs = DEFAULT_TIMEOUT_MS, signal, cwd } = {}) {
	return new Promise((settle) => {
		let child
		try {
			child = spawn(exe, args, { cwd, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] })
		} catch (error) {
			settle({ code: -1, stdout: "", stderr: "", timedOut: false, aborted: false, error })
			return
		}
		let stdout = ""
		let stderr = ""
		let timedOut = false
		let aborted = false
		let done = false
		const kill = () => {
			try {
				child.kill()
			} catch {
				// 已经退出
			}
		}
		const onAbort = () => {
			aborted = true
			kill()
		}
		const timer = timeoutMs > 0
			? setTimeout(() => {
				timedOut = true
				kill()
			}, timeoutMs)
			: null
		const cleanup = () => {
			if (timer) clearTimeout(timer)
			signal?.removeEventListener?.("abort", onAbort)
		}
		const finish = (code, error) => {
			if (done) return
			done = true
			cleanup()
			settle({ code, stdout, stderr, timedOut, aborted, error })
		}
		if (signal) {
			if (signal.aborted) onAbort()
			else signal.addEventListener?.("abort", onAbort)
		}
		child.stdout?.on("data", (chunk) => {
			stdout += chunk
		})
		child.stderr?.on("data", (chunk) => {
			stderr += chunk
		})
		child.on("error", (error) => finish(-1, error))
		child.on("close", (code) => finish(code === null ? -1 : code))
	})
}

/** 逐行解析 stdout 的 JSON；非 JSON 行（人类可读摘要/警告）收集到 others。 */
export function parseJsonLines(text) {
	const records = []
	const others = []
	for (const raw of String(text ?? "").split(/\r?\n/)) {
		const line = raw.trim()
		if (!line) continue
		try {
			records.push(JSON.parse(line))
		} catch {
			others.push(line)
		}
	}
	return { records, others }
}

/** 解析可能是逐行 JSON、也可能是整段美化 JSON 的输出。 */
export function parseJsonOutput(text) {
	const direct = String(text ?? "").trim()
	if (direct.startsWith("[") || direct.startsWith("{")) {
		try {
			return { value: JSON.parse(direct), records: [], others: [], whole: true }
		} catch {
			// 交给逐行解析
		}
	}
	const { records, others } = parseJsonLines(text)
	if (records.length > 0) return { value: records.length === 1 ? records[0] : records, records, others, whole: false }
	return { value: null, records: [], others, whole: false }
}

/** batch stdout 尾部的 "N succeeded, M failed" 摘要。 */
export function parseBatchSummary(stdout) {
	const match = /(\d+)\s+succeeded,\s+(\d+)\s+failed/i.exec(String(stdout ?? ""))
	const okFiles = []
	const failLines = []
	for (const line of String(stdout ?? "").split(/\r?\n/)) {
		const trimmed = line.trim()
		if (trimmed.startsWith("ok ")) okFiles.push(trimmed.slice(3).trim())
		else if (trimmed.startsWith("FAIL")) failLines.push(trimmed)
	}
	return {
		succeeded: match ? Number(match[1]) : okFiles.length,
		failed: match ? Number(match[2]) : failLines.length,
		okFiles,
		failLines,
	}
}

export function describeFailure(result, args) {
	if (result.timedOut) return `photocraft-cli 超时（${args.join(" ").slice(0, 200)}）`
	if (result.aborted) return "photocraft-cli 已被中止"
	if (result.error) return `photocraft-cli 无法启动：${result.error.message ?? result.error}`
	const detail = String(result.stderr ?? "").trim() || String(result.stdout ?? "").trim()
	return `photocraft-cli 退出码 ${result.code}：${detail.slice(0, 600) || "无输出"}`
}

export async function cliStatus(config = {}) {
	const path = resolveCliPath(config)
	try {
		await access(path, FS.F_OK)
	} catch {
		return { ok: false, path, error: `找不到 photocraft-cli：${path}` }
	}
	const timeoutMs = Number(config?.timeoutMs) > 0 ? Number(config.timeoutMs) : 15_000
	const result = await spawnCapture(path, ["--version"], { timeoutMs })
	if (result.code !== 0) return { ok: false, path, error: describeFailure(result, ["--version"]) }
	const version = String(result.stdout).trim().split(/\r?\n/)[0] || "(未知版本)"
	return { ok: true, path, version }
}

/** run：input 或 --new 二选一，可链式多条 --cmd/--params。 */
export async function cliRun(options = {}) {
	const cliPath = resolveCliPath(options)
	const args = ["run"]
	if (options.newDoc) args.push("--new", JSON.stringify(options.newDoc))
	else if (options.input) args.push(toPosix(options.input))
	else throw new Error("cliRun 需要 input 或 newDoc")
	for (const step of normalizeSteps(options.steps)) {
		args.push("--cmd", step.command)
		if (step.params !== undefined) args.push("--params", JSON.stringify(step.params))
	}
	if (options.output) args.push("--out", toPosix(options.output))
	if (options.format) args.push("--format", String(options.format))
	if (options.quality !== undefined && options.quality !== null) args.push("--quality", String(options.quality))
	if (options.tiffLayers) args.push("--tiff-layers")

	const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : DEFAULT_TIMEOUT_MS
	const started = Date.now()
	const result = await spawnCapture(cliPath, args, { timeoutMs, signal: options.signal, cwd: options.cwd })
	const parsed = parseJsonOutput(result.stdout)
	if (result.code !== 0) throw new PhotocraftCliError(describeFailure(result, args), { ...result, args })
	return { ...parsed, code: result.code, stdout: result.stdout, stderr: result.stderr, seconds: (Date.now() - started) / 1000 }
}

export async function cliInfo(options = {}) {
	const cliPath = resolveCliPath(options)
	if (!options.file) throw new Error("cliInfo 需要 file")
	const args = ["info", toPosix(options.file)]
	if (options.compact !== false) args.push("--compact")
	const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : DEFAULT_TIMEOUT_MS
	const result = await spawnCapture(cliPath, args, { timeoutMs, signal: options.signal })
	if (result.code !== 0) throw new PhotocraftCliError(describeFailure(result, args), { ...result, args })
	const parsed = parseJsonOutput(result.stdout)
	if (parsed.value === null) throw new PhotocraftCliError(`photocraft info 输出不是 JSON：${result.stdout.slice(0, 300)}`, { ...result, args })
	return parsed.value
}

/** batch：actions 文件 + 输入目录 + 输出目录。 */
export async function cliBatch(options = {}) {
	const cliPath = resolveCliPath(options)
	if (!options.actions) throw new Error("cliBatch 需要 actions（actions.json 路径）")
	if (!options.inDir || !options.outDir) throw new Error("cliBatch 需要 inDir 与 outDir")
	const args = ["batch", "--actions", toPosix(options.actions)]
	if (options.action) args.push("--action", String(options.action))
	args.push("--in", toPosix(options.inDir), "--out", toPosix(options.outDir))
	if (options.inPlace) args.push("--in-place")
	if (options.format) args.push("--format", String(options.format))
	if (options.quality !== undefined && options.quality !== null) args.push("--quality", String(options.quality))
	if (options.tiffLayers) args.push("--tiff-layers")

	const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : DEFAULT_TIMEOUT_MS
	const started = Date.now()
	const result = await spawnCapture(cliPath, args, { timeoutMs, signal: options.signal, cwd: options.cwd })
	const summary = parseBatchSummary(result.stdout)
	if (result.code !== 0) {
		const error = new PhotocraftCliError(describeFailure(result, args), { ...result, args })
		error.summary = summary
		throw error
	}
	return { ...summary, stdout: result.stdout, stderr: result.stderr, code: result.code, seconds: (Date.now() - started) / 1000 }
}

/** commands --json：整段 JSON 数组（918 条）。 */
export async function cliCommands(options = {}) {
	const cliPath = resolveCliPath(options)
	const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 60_000
	const result = await spawnCapture(cliPath, ["commands", "--json"], { timeoutMs, signal: options.signal })
	if (result.code !== 0) throw new PhotocraftCliError(describeFailure(result, ["commands", "--json"]), { ...result, args: ["commands", "--json"] })
	let value
	try {
		value = JSON.parse(result.stdout)
	} catch (error) {
		throw new PhotocraftCliError(`photocraft commands --json 解析失败：${error.message}`, { ...result, args: ["commands", "--json"] })
	}
	if (!Array.isArray(value)) throw new PhotocraftCliError("photocraft commands --json 返回的不是数组", { ...result, args: ["commands", "--json"] })
	return { commands: value, stdout: result.stdout, seconds: 0 }
}

/** 归一化步骤：[id, params] / {command,params} / {cmd,params} / "id"。 */
export function normalizeSteps(steps) {
	if (steps === undefined || steps === null || steps === "") return []
	const list = Array.isArray(steps) ? steps : [steps]
	return list.map((entry, index) => {
		if (typeof entry === "string") {
			if (!entry.trim()) throw new Error(`第 ${index + 1} 步的命令 id 为空`)
			return { command: entry.trim() }
		}
		if (Array.isArray(entry)) {
			const [command, params] = entry
			if (typeof command !== "string" || !command.trim()) throw new Error(`第 ${index + 1} 步缺少命令 id`)
			return params === undefined ? { command: command.trim() } : { command: command.trim(), params }
		}
		if (entry && typeof entry === "object") {
			const command = entry.command ?? entry.cmd ?? entry.id
			if (typeof command !== "string" || !command.trim()) throw new Error(`第 ${index + 1} 步缺少命令 id`)
			const params = entry.params ?? entry.parameters
			return params === undefined ? { command: command.trim() } : { command: command.trim(), params }
		}
		throw new Error(`第 ${index + 1} 步格式不合法（应为 id / [id,params] / {command,params}）`)
	})
}
