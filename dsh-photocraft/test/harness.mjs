// pc-verify 独立验证 harness：fake ctx 加载 ../lib/index.js，收集工具定义并真实调用。
// 只做"加载 + 调用 + 断言/统计"，不采信任何队友转述的数字。
import { register } from "node:module"
import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

register("./loader.mjs", import.meta.url)

export const TEST_DIR = dirname(fileURLToPath(import.meta.url))
export const PLUGIN_DIR = resolve(TEST_DIR, "..")
export const TMP_ROOT = "D:/dsh-workbench/tmp/pc-verify"
export const SAMPLES = "D:/dsh-workbench/tmp/psv"
export const PY = "C:/Users/HY/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/python/python.exe"
export const NODE = "C:/Users/HY/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/node/bin/node.exe"
export const CLI = "D:/PS-V/photocraft-cli.exe"
export const CHECK_OUTPUTS = resolve(TEST_DIR, "check_outputs.py")

export function ensureDir(dir) {
	mkdirSync(dir, { recursive: true })
	return dir
}

export function run(cmd, args, opts = {}) {
	const res = spawnSync(cmd, args, {
		encoding: "utf8",
		timeout: opts.timeout ?? 180_000,
		maxBuffer: 32 * 1024 * 1024,
		cwd: opts.cwd ?? TMP_ROOT,
		windowsHide: true,
	})
	return {
		ok: res.status === 0,
		status: res.status,
		stdout: String(res.stdout ?? ""),
		stderr: String(res.stderr ?? ""),
		error: res.error ? String(res.error.message ?? res.error) : "",
	}
}

// fake ctx：tools.register 收集；effect 立即执行并记录 disposer；其余是壳。
export function makeCtx(services = {}, logs = []) {
	const tools = new Map()
	const handlers = new Map()
	const disposers = []
	const ctx = {
		_tools: tools,
		_handlers: handlers,
		_disposers: disposers,
		_logs: logs,
		logger: {
			info: (m) => logs.push({ level: "info", msg: String(m) }),
			warn: (m) => logs.push({ level: "warn", msg: String(m) }),
			error: (m) => logs.push({ level: "error", msg: String(m) }),
			debug: (m) => logs.push({ level: "debug", msg: String(m) }),
		},
		tools: {
			register(tool) {
				if (!tool || typeof tool.name !== "string") throw new Error("tools.register 收到非法工具定义")
				tools.set(tool.name, tool)
				return () => tools.delete(tool.name)
			},
		},
		effect(cb, label) {
			const disposer = cb()
			disposers.push([label ?? "effect", disposer])
			return disposer
		},
		on(ev, fn) {
			const list = handlers.get(ev) ?? []
			list.push(fn)
			handlers.set(ev, list)
			return () => {}
		},
		get: (name) => services[name],
		reflect: { get: (name) => services[name] },
		inject(deps, cb) {
			if (Array.isArray(deps) && deps.every((d) => services[d] !== undefined)) cb(ctx)
		},
		plugins: { entries: () => [] },
	}
	return ctx
}

export function emit(ctx, event, ...args) {
	for (const fn of ctx._handlers.get(event) ?? []) fn(...args)
}

export async function loadPlugin({ config = {}, services = {}, logs = [] } = {}) {
	const ctx = makeCtx(services, logs)
	const mod = await import(new URL("../lib/index.js", import.meta.url).href)
	if (typeof mod.apply !== "function") throw new Error("lib/index.js 未导出 apply()")
	await mod.apply(ctx, config)
	return { mod, ctx, tools: ctx._tools, services, logs }
}

// fake webServer：把 register({kind,path,handler}) 收集到表，返回 stop()
export function fakeWebServer(routes = []) {
	return {
		routes,
		register(route) {
			routes.push(route)
			return () => {
				const i = routes.indexOf(route)
				if (i >= 0) routes.splice(i, 1)
			}
		},
	}
}

export async function callTool(tools, name, args = {}, extra = {}) {
	const tool = tools.get(name)
	if (!tool) throw new Error("工具未注册：" + name + "（已注册：" + [...tools.keys()].join(", ") + "）")
	const signal = extra.signal ?? new AbortController().signal
	const exec = {
		agent: extra.agent ?? { session: { header: { cwd: "D:/dsh-workbench" } } },
		signal,
	}
	try {
		const value = await tool.execute(args, { ...exec, ...extra, signal })
		return { ok: true, value }
	} catch (error) {
		return { ok: false, error: String(error?.stack ?? error?.message ?? error) }
	}
}

// 从工具返回值里递归找出真实存在的图片/PSD 输出路径
export function findOutputFiles(result, limit = 50) {
	const out = []
	const seen = new Set()
	const walk = (node, depth) => {
		if (node == null || depth > 6 || out.length >= limit) return
		if (typeof node === "string") {
			if (/\.(png|psd|jpg|jpeg|webp|tif|tiff)$/i.test(node) && !seen.has(node) && existsSync(node)) {
				seen.add(node)
				out.push(node)
			}
			return
		}
		if (Array.isArray(node)) {
			for (const item of node) walk(item, depth + 1)
			return
		}
		if (typeof node === "object") {
			for (const value of Object.values(node)) walk(value, depth + 1)
		}
	}
	walk(result, 0)
	return out
}

// 工具返回的「真实输出」：优先 files[].output / value.output，绝不把 input 路径当成输出。
export function outputFilesOf(value, { includeFailed = false } = {}) {
	const out = []
	const seen = new Set()
	const push = (p) => {
		if (typeof p !== "string" || !/\.(png|psd|jpg|jpeg|webp|tif|tiff)$/i.test(p)) return
		const norm = p.replace(/\\/g, "/")
		if (seen.has(norm) || !existsSync(p)) return
		seen.add(norm)
		out.push(p)
	}
	if (value && typeof value === "object") {
		for (const f of Array.isArray(value.files) ? value.files : []) {
			if (!includeFailed && f && f.ok === false) continue
			push(f?.output)
		}
		if (out.length === 0) push(value.output)
	}
	return out
}

export function readJson(path) {
	return JSON.parse(readFileSync(path, "utf8"))
}

// python check_outputs.py 包装：返回 {ok, status, json, raw}
export function pythonCheck(args) {
	const res = run(PY, [CHECK_OUTPUTS, ...args], { timeout: 120_000 })
	let parsed = null
	try {
		parsed = JSON.parse(res.stdout.trim().split("\n").pop())
	} catch {
		parsed = null
	}
	return { ...res, json: parsed }
}

export function makeReporter(title) {
	const rows = []
	return {
		rows,
		section(name) {
			console.log("\n--- " + name + " ---")
		},
		check(id, ok, detail = "") {
			rows.push({ id, ok: !!ok, detail })
			console.log((ok ? "PASS" : "FAIL") + "  " + id + (detail ? "  ::  " + detail : ""))
			return !!ok
		},
		finish() {
			const failed = rows.filter((r) => !r.ok)
			console.log("\n" + title + ": " + (rows.length - failed.length) + "/" + rows.length + " passed; failures=" + failed.length)
			for (const f of failed) console.log("  FAILED: " + f.id + " :: " + f.detail)
			return failed.length === 0
		},
	}
}