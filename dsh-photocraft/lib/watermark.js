// 功能1：批量去豆包 AI 水印。
// 检测走 sidecar/detect_watermark.py（Pillow+numpy），清除走 photocraft-cli run 链。
import { resolveCliPath, cliRun } from "./cli.js"
import { runPythonJson, resolvePythonPath } from "./python.js"
import { emitLog, formatExt, outputPathFor, prepareJob, resolveWorkRoot, sidecarScript } from "./paths.js"

export const DEWATERMARK_METHODS = ["fill", "contentAware", "patch"]
const MODES = new Set(["auto", "bottom-right", "bottom-left", "bottom-band"])

/** 水印区域没检测到时的兜底框：右下角 W*0.45 × H*0.22，按 padding 外扩。 */
export function defaultCornerBox(width, height, padding = 4) {
	const w = Math.max(1, Math.round(width * 0.45))
	const h = Math.max(1, Math.round(height * 0.22))
	const x = Math.max(0, width - w - padding)
	const y = Math.max(0, height - h - padding)
	const x2 = Math.min(width, width + padding)
	const y2 = Math.min(height, height + padding)
	return [x, y, Math.max(1, x2 - x), Math.max(1, y2 - y)]
}

export function expandBox(box, padding, width, height) {
	const x = Math.max(0, Math.floor(Number(box[0]) - padding))
	const y = Math.max(0, Math.floor(Number(box[1]) - padding))
	const x2 = Math.min(width, Math.ceil(Number(box[0]) + Number(box[2]) + padding))
	const y2 = Math.min(height, Math.ceil(Number(box[1]) + Number(box[3]) + padding))
	return [x, y, x2 - x, y2 - y]
}

/** region 也可以直接写 "x,y,w,h" 手工指定（检测结果仍用于取画布尺寸）。 */
export function parseManualBox(region) {
	if (typeof region !== "string") return null
	const match = /^\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*$/.exec(region)
	if (!match) return null
	return [Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4])]
}

export function stepsForMethod(method, box, options = {}) {
	const [x, y, width, height] = box
	const select = ["select.rect", { x, y, width, height }]
	if (method === "fill") return [select, ["edit.deleteAndFillSelection"]]
	if (method === "contentAware") {
		const params = { sampling: "auto", output: "current" }
		if (options.margin !== undefined && options.margin !== null) params.margin = Number(options.margin)
		return [select, ["edit.contentAwareFill", params]]
	}
	if (method === "patch") return [select, ["paint.patch", { offset: [0, -2 * height], contentAware: true }]]
	throw new Error(`未知清除方式：${method}（可用 fill / contentAware / patch）`)
}

/**
 * runDewatermark({ input, output, recursive, region, padding, method, onMiss, format, quality, margin, logger, signal })
 * → { ok, kind:"dewatermark", input, output, dir, files[], summary{total,ok,failed,skipped}, seconds }
 */
export async function runDewatermark(options = {}) {
	const started = Date.now()
	const input = options.input
	if (!input) throw new Error("runDewatermark 需要 input（单个图片或目录）")
	const format = options.format || "png"
	const ext = formatExt(format)
	const method = String(options.method || "fill")
	if (!DEWATERMARK_METHODS.includes(method)) throw new Error(`未知清除方式：${method}（可用 fill / contentAware / patch）`)
	const onMiss = String(options.onMiss || "skip")
	if (!["skip", "corner", "fail"].includes(onMiss)) throw new Error(`未知 onMiss：${onMiss}（可用 skip / corner / fail）`)
	const padding = Number.isFinite(Number(options.padding)) ? Math.max(0, Math.trunc(Number(options.padding))) : 4
	const rawRegion = options.region === undefined || options.region === null || options.region === "" ? "auto" : String(options.region)
	const manualBox = parseManualBox(rawRegion)
	const mode = manualBox ? "auto" : (MODES.has(rawRegion) ? rawRegion : "auto")
	const workRoot = resolveWorkRoot(options)
	const detectScript = sidecarScript("detect_watermark.py", options)
	const logger = options.logger

	const job = await prepareJob({ kind: "dewatermark", input, output: options.output, recursive: Boolean(options.recursive), workRoot, ext })
	const files = []
	let aborted = false
	for (const file of job.files) {
		if (options.signal?.aborted) {
			aborted = true
			break
		}
		const target = await outputPathFor(job, file, ext)
		try {
			// 检测脚本优先；但「手动 region」永远压过检测结果，检测失败也照用（画布尺寸只用于夹取）。
			let detection = null
			let detectError = null
			try {
				detection = await runPythonJson({
					script: detectScript,
					args: ["--image", file, "--mode", mode, "--json"],
					timeoutMs: options.timeoutMs,
					signal: options.signal,
					pythonPath: options.pythonPath,
				})
				if (detection && detection.ok === false) {
					detectError = new Error(String(detection.error || "水印检测失败"))
					detection = null
				}
			} catch (error) {
				detectError = error
				detection = null
			}
			if (detectError && !manualBox) throw detectError
			if (detectError) {
				emitLog(logger, "warn", `[dsh-photocraft] 水印检测不可用，改用手动 region：${detectError?.message ?? detectError}`)
			}
			const width = Number(detection?.width) || 0
			const height = Number(detection?.height) || 0
			const confidence = typeof detection?.confidence === "number" ? detection.confidence : null
			let box = null
			if (manualBox) box = manualBox
			else if (detection?.found && Array.isArray(detection.bbox)) box = detection.bbox
			else if (onMiss === "corner") {
				if (!width || !height) throw new Error("检测结果缺少画布尺寸，无法用右下角兜底框")
				box = defaultCornerBox(width, height, padding)
			} else if (onMiss === "fail") throw new Error("未检测到水印（onMiss=fail）")

			if (!box) {
				files.push({
					input: file, output: null, ok: false, skipped: true,
					bbox: null, rawBbox: detection?.raw_bbox ?? null, method, confidence,
					detectedBbox: null, regionSource: "auto",
					error: "未检测到水印，已跳过",
				})
				emitLog(logger, "info", `[dsh-photocraft] 未检测到水印，跳过 ${file}`)
				continue
			}
			const finalBox = (width > 0 && height > 0)
				? expandBox(box, padding, width, height)
				: [
					Math.max(0, Math.floor(Number(box[0]) - padding)),
					Math.max(0, Math.floor(Number(box[1]) - padding)),
					Math.max(1, Math.ceil(Number(box[2]) + padding * 2)),
					Math.max(1, Math.ceil(Number(box[3]) + padding * 2)),
				]
			if (finalBox[2] < 1 || finalBox[3] < 1) throw new Error("水印区域外扩后为空")

			const run = await cliRun({
				input: file,
				steps: stepsForMethod(method, finalBox, { margin: options.margin }),
				output: target,
				format,
				quality: options.quality ?? 92,
				timeoutMs: options.timeoutMs,
				signal: options.signal,
				cliPath: options.cliPath ?? resolveCliPath(options),
			})
			files.push({
				input: file,
				output: target,
				ok: true,
				skipped: false,
				bbox: finalBox,
				rawBbox: detection?.raw_bbox ?? (Array.isArray(detection?.bbox) ? detection.bbox : null),
				detectedBbox: Array.isArray(detection?.bbox) ? detection.bbox : null,
				regionSource: manualBox ? "manual" : "auto",
				method,
				confidence,
				detectMethod: detection?.method ?? null,
				pixels: finalBox[2] * finalBox[3],
				commands: run.records ?? [],
				seconds: run.seconds,
			})
		} catch (error) {
			files.push({
				input: file, output: null, ok: false, skipped: false,
				bbox: null, method, confidence: null,
				error: String(error?.message ?? error),
			})
			emitLog(logger, "warn", `[dsh-photocraft] 去水印失败 ${file}：${error?.message ?? error}`)
		}
	}
	const summary = summarize(files)
	const supplied = job.files.length
	return {
		ok: summary.failed === 0 && !aborted,
		kind: "dewatermark",
		input,
		output: job.singleFile || job.dir,
		dir: job.dir,
		files,
		summary,
		aborted,
		pending: aborted ? supplied - files.length : 0,
		seconds: (Date.now() - started) / 1000,
	}
}

export function summarize(files) {
	return {
		total: files.length,
		ok: files.filter((file) => file.ok).length,
		failed: files.filter((file) => !file.ok && !file.skipped).length,
		skipped: files.filter((file) => file.skipped).length,
	}
}
