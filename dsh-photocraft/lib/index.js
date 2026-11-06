// dsh-photocraft：把 D:\PS-V\photocraft-cli.exe 包装成 3 个功能 + 6 个工具 + 网页工作台。
//
// 注册的工具：
//   photocraft_status / photocraft_dewatermark / photocraft_cutout /
//   photocraft_brush_paint / photocraft_run（逃生通道）/ photocraft_commands
// 网页工作台：lib/http.js 的 registerWorkbench（缺失只 warn，不影响工具）。
import { join, isAbsolute, dirname } from "node:path"
import { existsSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import z from "@deepseek-ai/schemastery"
import { defineTool } from "@deepseek-ai/dsh-tools"
import { DEFAULT_CLI_PATH, cliCommands, cliRun, cliStatus, normalizeSteps } from "./cli.js"
import { DEFAULT_PYTHON_PATH, pythonStatus } from "./python.js"
import { DEFAULT_WORK_ROOT, PLUGIN_ROOT, resolveWorkRoot, sidecarScript, toPosix } from "./paths.js"
import { runCutout } from "./cutout.js"
import { runBrushPaint, BRUSH_STYLES } from "./paint.js"
import { runDewatermark } from "./watermark.js"
import { registerWorkbench } from "./http.js"

export const name = "dsh-photocraft"
export const inject = ["tools"]
export const Config = z.object({
	cliPath: z.string().default("D:/PS-V/photocraft-cli.exe"),
	pythonPath: z.string().default("C:/Users/HY/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/python/python.exe"),
	workRoot: z.string().default("D:/dsh-workbench/photocraft"),
	timeoutMs: z.number().default(120000),
})

// 三个 pipeline 也从入口再导出，方便网页端 / 验证脚本统一 import "./index.js"。
export { runDewatermark, runCutout, runBrushPaint }

function asText(value) {
	return [{ type: "text", text: JSON.stringify(value, null, 2) }]
}

function sessionCwd(exec) {
	const cwd = exec?.agent?.session?.header?.cwd
	return typeof cwd === "string" && cwd.length > 0 ? cwd : undefined
}

/** 相对路径按会话工作目录补全；绝对路径（含盘符）原样返回。 */
export function resolveUserPath(cwd, value) {
	if (value === undefined || value === null || value === "") return value
	const raw = String(value)
	if (isAbsolute(raw) || /^[a-zA-Z]:[\\/]/.test(raw)) return raw
	return join(cwd ?? process.cwd(), raw)
}

function toolBase(config) {
	return {
		cliPath: config.cliPath || DEFAULT_CLI_PATH,
		pythonPath: config.pythonPath || DEFAULT_PYTHON_PATH,
		workRoot: resolveWorkRoot({ workRoot: config.workRoot || DEFAULT_WORK_ROOT }),
		timeoutMs: Number(config.timeoutMs) > 0 ? Number(config.timeoutMs) : 120000,
	}
}

let statusCache = null

/** 工具与网页端共用的环境体检。 */
export async function photoStatus(config = {}) {
	const key = JSON.stringify([config.cliPath ?? null, config.pythonPath ?? null, config.workRoot ?? null, config.samples ?? null])
	if (statusCache && statusCache.key === key && Date.now() - statusCache.at < 30_000) return statusCache.value
	const workRoot = toPosix(resolveWorkRoot(config))
	const [cli, python] = await Promise.all([
		cliStatus({ cliPath: config.cliPath || DEFAULT_CLI_PATH, timeoutMs: 20_000 })
			.catch((error) => ({ ok: false, path: config.cliPath || DEFAULT_CLI_PATH, error: String(error?.message ?? error) })),
		pythonStatus({ pythonPath: config.pythonPath || DEFAULT_PYTHON_PATH })
			.catch((error) => ({ ok: false, path: config.pythonPath || DEFAULT_PYTHON_PATH, error: String(error?.message ?? error) })),
	])
	const samplesDir = config.samples || join(PLUGIN_ROOT, "samples")
	const value = {
		ok: Boolean(cli.ok && python.ok),
		cli,
		python,
		dirs: {
			work: workRoot,
			inbox: toPosix(join(workRoot, "inbox")),
			out: toPosix(join(workRoot, "out")),
			cache: toPosix(join(workRoot, "cache")),
			samples: existsSync(samplesDir) ? toPosix(samplesDir) : null,
		},
		sidecar: {
			dir: toPosix(join(PLUGIN_ROOT, "sidecar")),
			detect: toPosix(sidecarScript("detect_watermark.py", config)),
			plan: toPosix(sidecarScript("brush_plan.py", config)),
		},
		pluginRoot: PLUGIN_ROOT,
		workbench: "/plugins/dsh-photocraft/",
		updatedAt: new Date().toISOString(),
	}
	statusCache = { key, at: Date.now(), value }
	return value
}

/**
 * @param {import("@deepseek-ai/cordis").Context} ctx
 */
export function apply(ctx, config = {}) {
	const base = toolBase(config)
	const logger = ctx.logger
	const signalOf = (exec) => exec?.signal

	ctx.tools.register(defineTool({
		name: "photocraft_status",
		description: "检查 dsh-photocraft 环境：photocraft-cli 是否可执行、bundled python 是否可用、工作/输出/样例目录。第一次用 photocraft 之前或报错时先跑这个。",
		parameters: {},
		output: { schema: { type: "object", additionalProperties: true }, render: (_a, v) => asText(v) },
		async execute() {
			return photoStatus(base)
		},
	}))

	ctx.tools.register(defineTool({
		name: "photocraft_dewatermark",
		description: "批量去除豆包 AI 水印：先用 sidecar 检测右下角水印框，再调 photocraft-cli 的 select.rect + edit.deleteAndFillSelection 填充。输入单张图片或目录；目录默认只看第一层，recursive=true 递归。输出默认落到 D:/dsh-workbench/photocraft/<时间戳>-dewatermark/。",
		parameters: {
			input: { type: "string", required: true, description: "图片文件或目录（相对会话工作目录或绝对路径）" },
			output: { type: "string", description: "输出文件或目录，缺省自动建时间戳目录" },
			region: { type: "string", description: "auto（默认，sidecar 检测）或手动 x,y,w,h" },
			padding: { type: "number", description: "检测框外扩像素，默认 4" },
			method: { type: "string", description: "fill（默认）| contentAware | patch" },
			onMiss: { type: "string", description: "没检测到水印时：skip（默认）| corner（右下角兜底框）| fail" },
			format: { type: "string", description: "输出格式，默认 png" },
			quality: { type: "number", description: "jpg/webp 质量，默认 92" },
			recursive: { type: "boolean", description: "输入是目录时是否递归子目录，默认 false" },
		},
		output: { schema: { type: "object", additionalProperties: true }, render: (_a, v) => asText(v) },
		async execute(args, exec) {
			const cwd = sessionCwd(exec)
			return runDewatermark({
				...base,
				input: resolveUserPath(cwd, args.input),
				output: resolveUserPath(cwd, args.output),
				recursive: Boolean(args.recursive),
				region: args.region || "auto",
				padding: args.padding ?? 4,
				method: args.method || "fill",
				onMiss: args.onMiss || "skip",
				format: args.format || "png",
				quality: args.quality ?? 92,
				logger,
				signal: signalOf(exec),
			})
		},
	}))

	ctx.tools.register(defineTool({
		name: "photocraft_cutout",
		description: "一键抠图：layer.removeBackground（可 refine 边缘）→ colorDecontaminate 去色污染 → 可选 image.trim 裁透明边，输出带透明通道的 PNG。输入单张图片或目录（recursive=true 递归）。",
		parameters: {
			input: { type: "string", required: true, description: "图片文件或目录（相对会话工作目录或绝对路径）" },
			output: { type: "string", description: "输出文件或目录，缺省自动建时间戳目录" },
			refine: { type: "boolean", description: "细化边缘，默认 true" },
			decontaminate: { type: "boolean", description: "去色污染，默认 true" },
			trim: { type: "boolean", description: "裁掉透明边（会改变画布尺寸），默认 false" },
			format: { type: "string", description: "输出格式，默认 png（要透明请用 png）" },
			recursive: { type: "boolean", description: "输入是目录时是否递归子目录，默认 false" },
		},
		output: { schema: { type: "object", additionalProperties: true }, render: (_a, v) => asText(v) },
		async execute(args, exec) {
			const cwd = sessionCwd(exec)
			return runCutout({
				...base,
				input: resolveUserPath(cwd, args.input),
				output: resolveUserPath(cwd, args.output),
				refine: args.refine !== false,
				decontaminate: args.decontaminate !== false,
				trim: Boolean(args.trim),
				format: args.format || "png",
				recursive: Boolean(args.recursive),
				logger,
				signal: signalOf(exec),
			})
		},
	}))

	ctx.tools.register(defineTool({
		name: "photocraft_brush_paint",
		description: "按图画笔作画：sidecar 生成笔触计划，再用 photocraft-cli batch 逐笔 paint.stroke，产出一比一的画笔风格画（PNG 会合并图层，PSD 保留 background/paint 图层）。风格：" + BRUSH_STYLES.join(" / ") + "。",
		parameters: {
			input: { type: "string", required: true, description: "参考图片（相对会话工作目录或绝对路径）" },
			output: { type: "string", description: "输出文件或目录，缺省自动建时间戳目录" },
			style: { type: "string", description: BRUSH_STYLES.join(" | ") + "，默认 impressionist" },
			brushSize: { type: "number", description: "笔刷大小，默认 24" },
			density: { type: "number", description: "笔触密度，默认 1" },
			passes: { type: "number", description: "遍数，默认 2" },
			jitter: { type: "number", description: "抖动，默认 0.35" },
			seed: { type: "number", description: "随机种子，默认 7" },
			maxStrokes: { type: "number", description: "最大笔触数，默认 4000" },
			keepReference: { type: "boolean", description: "保留参考层（PSD 可见），默认 false" },
			format: { type: "string", description: "png（默认）或 psd（保图层）" },
		},
		output: { schema: { type: "object", additionalProperties: true }, render: (_a, v) => asText(v) },
		async execute(args, exec) {
			const cwd = sessionCwd(exec)
			return runBrushPaint({
				...base,
				input: resolveUserPath(cwd, args.input),
				output: resolveUserPath(cwd, args.output),
				style: args.style || "impressionist",
				brushSize: args.brushSize ?? 24,
				density: args.density ?? 1,
				passes: args.passes ?? 2,
				jitter: args.jitter ?? 0.35,
				seed: args.seed ?? 7,
				maxStrokes: args.maxStrokes ?? 4000,
				keepReference: Boolean(args.keepReference),
				format: args.format || "png",
				recursive: false,
				logger,
				signal: signalOf(exec),
			})
		},
	}))

	ctx.tools.register(defineTool({
		name: "photocraft_run",
		description: "photocraft-cli 逃生通道：直接按命令 id 跑任意命令链（去水印/抠图/画笔覆盖不到的场合）。steps 可传 JSON 字符串或数组，元素形如 [\"select.rect\",{\"x\":0}] 或 {\"cmd\":\"layer.new.layer\",\"params\":{}}；也可用 newDoc 从空白文档开始。命令清单先用 photocraft_commands 查。",
		parameters: {
			input: { type: "string", description: "输入图片（与 newDoc 二选一）" },
			steps: { type: "string", required: true, description: "命令链 JSON：[[cmd,params],...] 或 [{cmd,params},...]" },
			output: { type: "string", description: "输出文件路径（缺省写到 cli 默认位置）" },
			format: { type: "string", description: "输出格式，如 png / psd" },
			quality: { type: "number", description: "jpg/webp 质量" },
			newDoc: { type: "string", description: "从空白文档开始，JSON 如 {width:800,height:600}" },
			tiffLayers: { type: "boolean", description: "TIFF 保图层" },
		},
		output: { schema: { type: "object", additionalProperties: true }, render: (_a, v) => asText(v) },
		async execute(args, exec) {
			const cwd = sessionCwd(exec)
			let steps = args.steps
			if (typeof steps === "string") {
				try {
					steps = JSON.parse(steps)
				} catch (error) {
					throw new Error("steps 不是合法 JSON：" + (error?.message ?? error))
				}
			}
			let newDoc = args.newDoc
			if (typeof newDoc === "string" && newDoc.trim()) {
				try {
					newDoc = JSON.parse(newDoc)
				} catch (error) {
					throw new Error("newDoc 不是合法 JSON：" + (error?.message ?? error))
				}
			}
			const out = resolveUserPath(cwd, args.output)
			const result = await cliRun({
				...base,
				input: newDoc ? undefined : resolveUserPath(cwd, args.input),
				newDoc: newDoc || undefined,
				steps: normalizeSteps(steps),
				output: out,
				format: args.format,
				quality: args.quality,
				tiffLayers: Boolean(args.tiffLayers),
				signal: signalOf(exec),
			})
			return {
				ok: true,
				kind: "run",
				code: result.code,
				commands: result.records?.length ?? 0,
				records: result.records ?? [],
				notices: result.others ?? [],
				value: result.value ?? null,
				output: out ?? null,
				seconds: result.seconds,
				stderr: String(result.stderr ?? "").trim() || undefined,
			}
		},
	}))

	let commandsCache = null
	ctx.tools.register(defineTool({
		name: "photocraft_commands",
		description: "查 photocraft-cli 的命令注册表（918 条），支持关键词过滤；结果缓存到 <work>/cache/commands.json。写 photocraft_run 的 steps 前先查命令 id 与参数名。",
		parameters: {
			filter: { type: "string", description: "关键词，匹配 id / 分组 / 说明（大小写不敏感）" },
			json: { type: "boolean", description: "true 返回原始命令对象（较大），默认只返回摘要" },
			full: { type: "boolean", description: "true 带上参数的完整 schema" },
			limit: { type: "number", description: "最多返回条数，默认 200" },
		},
		output: { schema: { type: "object", additionalProperties: true }, render: (_a, v) => asText(v) },
		async execute(args) {
			commandsCache = commandsCache ?? await loadCommands(base, logger)
			const all = commandsCache
			const filter = String(args.filter ?? "").trim().toLowerCase()
			const matched = filter
				? all.filter((entry) => JSON.stringify(entry).toLowerCase().includes(filter))
				: all
			const limit = Number(args.limit) > 0 ? Number(args.limit) : 200
			const sliced = matched.slice(0, limit)
			const full = Boolean(args.full || args.json)
			const entries = sliced.map((entry) => (full ? entry : {
				id: entry.id,
				group: entry.group ?? entry.category ?? undefined,
				description: entry.description ?? entry.title ?? entry.label ?? undefined,
				params: entry.params ? Object.keys(entry.params) : undefined,
			}))
			return {
				ok: true,
				total: all.length,
				matched: matched.length,
				returned: entries.length,
				filter: filter || null,
				cache: toPosix(join(base.workRoot, "cache", "commands.json")),
				entries,
			}
		},
	}))

	/* ---------------------------------------------------------------- 网页工作台 */
	const WEB_SERVER_KEYS = ["webServer", "httpServer"]
	const readWebService = (key) => {
		try {
			const viaReflect = ctx.reflect?.get?.(key, false)
			if (viaReflect !== undefined) return viaReflect
		} catch {
			// 忽略：继续用 ctx.get 兜底
		}
		try {
			return ctx.get(key)
		} catch {
			return undefined
		}
	}
	let webSurfaceRegistered = false
	const registerWebSurface = () => {
		if (webSurfaceRegistered) return
		const webServer = WEB_SERVER_KEYS.map((key) => readWebService(key)).find((service) => service !== undefined)
		if (webServer === undefined) return
		webSurfaceRegistered = true
		// 顶层静态 import + 同步注册：apply() 返回时路由已在册，避免启动竞态（lead m00161）。
		ctx.effect(() => registerWorkbench(webServer, {
			root: PLUGIN_ROOT,
			work: base.workRoot,
			workRoot: base.workRoot,
			cliPath: base.cliPath,
			pythonPath: base.pythonPath,
			timeoutMs: base.timeoutMs,
			config: base,
		}), "dsh-photocraft.workbench")
	}
	registerWebSurface()
	ctx.on("internal/service", (serviceName) => {
		if (WEB_SERVER_KEYS.includes(serviceName)) registerWebSurface()
	})
	ctx.on("ready", () => {
		registerWebSurface()
		if (!webSurfaceRegistered) logger?.warn?.("[photocraft] 未找到 webServer/httpServer 服务，工作台 UI 未挂载")
	})
}

/** 优先读 <work>/cache/commands.json，没有就现场跑一次 cli 并写缓存。 */
async function loadCommands(base, logger) {
	const cachePath = join(base.workRoot, "cache", "commands.json")
	try {
		const text = await readFile(cachePath, "utf8")
		const parsed = JSON.parse(text)
		if (Array.isArray(parsed) && parsed.length > 0) return parsed
	} catch {
		// 没有缓存或缓存损坏：现场取一次
	}
	const { commands } = await cliCommands({ cliPath: base.cliPath, timeoutMs: Math.max(base.timeoutMs, 60_000) })
	try {
		await mkdir(dirname(cachePath), { recursive: true })
		await writeFile(cachePath, JSON.stringify(commands), "utf8")
	} catch (error) {
		logger?.warn?.("[photocraft] 命令缓存写入失败：" + (error?.message ?? error))
	}
	return commands
}
