// 功能3：按图用画笔一比一作画。
// sidecar/brush_plan.py 生成笔触计划 → 拼 actions.json → photocraft-cli batch 批处理成 PNG/PSD。
import { constants as FS } from "node:fs"
import { access, copyFile, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { cliBatch, resolveCliPath } from "./cli.js"
import { runPythonJson } from "./python.js"
import { baseNameOf, emitLog, ensureDir, formatExt, outputPathFor, prepareJob, relocate, resolveWorkRoot, sidecarScript } from "./paths.js"
import { summarize } from "./watermark.js"

export const BRUSH_STYLES = ["impressionist", "pointillist", "crosshatch", "ink", "pencil", "flat"]

const STROKE_KEYS = ["size", "hardness", "opacity", "flow", "color", "spacing", "smoothing", "mode", "preset"]

/** plan.json 的 stroke → paint.stroke 的 --params。 */
export function strokeToParams(stroke = {}) {
	const params = {}
	const points = Array.isArray(stroke.points)
		? stroke.points
			.filter((point) => Array.isArray(point) && point.length >= 2)
			.map((point) => [Math.round(Number(point[0])), Math.round(Number(point[1]))])
		: []
	if (points.length === 0) return null
	params.points = points
	for (const key of STROKE_KEYS) {
		if (stroke[key] === undefined || stroke[key] === null) continue
		params[key] = stroke[key]
	}
	if (params.mode === undefined) params.mode = "normal"
	return params
}

/** 汇编 batch 用的 actions：可选保留参考层 → 新建 paint 层 → 逐条 paint.stroke。 */
export function buildActions(strokes, options = {}) {
	const actions = []
	if (options.keepReference) actions.push(["layer.duplicate", { name: "reference" }])
	actions.push(["layer.new.layer", { name: "paint" }])
	let dropped = 0
	for (const stroke of strokes) {
		const params = strokeToParams(stroke)
		if (!params) {
			dropped++
			continue
		}
		actions.push(["paint.stroke", params])
	}
	return { actions, dropped, layerSteps: options.keepReference ? 2 : 1 }
}

function extensionOf(file) {
	const base = String(file).split(/[\\/]/).pop() ?? ""
	const dot = base.lastIndexOf(".")
	return dot > 0 ? base.slice(dot) : ".png"
}

async function isFile(path) {
	try {
		await access(path, FS.F_OK)
		return true
	} catch {
		return false
	}
}

async function findProduced(dir, base, ext) {
	const expected = join(dir, `${base}${ext}`)
	if (await isFile(expected)) return expected
	const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
	const hit = entries.find((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(ext.toLowerCase()))
	return hit ? join(dir, hit.name) : null
}

/**
 * runBrushPaint({ input, output, style, brushSize, density, passes, jitter, seed, maxStrokes,
 *                 keepReference, format, logger, signal })
 * → 同 runDewatermark 形状，额外字段 strokes / planPath。
 */
export async function runBrushPaint(options = {}) {
	const started = Date.now()
	const input = options.input
	if (!input) throw new Error("runBrushPaint 需要 input（单个图片或目录）")
	const format = options.format || "png"
	const ext = formatExt(format)
	const style = String(options.style || "impressionist")
	if (!BRUSH_STYLES.includes(style)) throw new Error(`未知作画风格：${style}（可用 ${BRUSH_STYLES.join(" / ")}）`)
	const workRoot = resolveWorkRoot(options)
	const logger = options.logger
	const keepReference = Boolean(options.keepReference)
	const planScript = sidecarScript("brush_plan.py", options)
	const job = await prepareJob({ kind: "paint", input, output: options.output, recursive: Boolean(options.recursive), workRoot, ext })
	const planDir = await ensureDir(join(job.dir, "plans"))
	const workDir = join(job.dir, "_work")
	const files = []
	let aborted = false

	for (let index = 0; index < job.files.length; index++) {
		const file = job.files[index]
		if (options.signal?.aborted) {
			aborted = true
			break
		}
		const target = await outputPathFor(job, file, ext)
		const base = baseNameOf(file) || "paint"
		const stem = `${index + 1}-${base}`
		const planPath = join(planDir, `${stem}.plan.json`)
		const actionsPath = join(planDir, `${stem}.actions.json`)
		const inDir = join(workDir, stem, "in")
		const outDir = join(workDir, stem, "out")
		try {
			const planResult = await runPythonJson({
				script: planScript,
				args: [
					"--image", file,
					"--out", planPath,
					"--style", style,
					"--brush-size", String(options.brushSize ?? 24),
					"--density", String(options.density ?? 1),
					"--passes", String(options.passes ?? 2),
					"--jitter", String(options.jitter ?? 0.35),
					"--seed", String(options.seed ?? 7),
					"--max-strokes", String(options.maxStrokes ?? 4000),
				],
				timeoutMs: options.timeoutMs,
				signal: options.signal,
				pythonPath: options.pythonPath,
			})
			if (planResult.ok === false) throw new Error(String(planResult.error || "笔触计划生成失败"))
			const plan = JSON.parse(await readFile(planPath, "utf8"))
			const strokes = Array.isArray(plan.strokes) ? plan.strokes : []
			if (strokes.length === 0) throw new Error("笔触计划为空")
			const { actions, dropped } = buildActions(strokes, { keepReference })
			await writeFile(actionsPath, JSON.stringify(actions), "utf8")

			// batch 需要「只放这张图」的输入目录。
			await ensureDir(inDir)
			await ensureDir(outDir)
			await copyFile(file, join(inDir, `${base}${extensionOf(file)}`))

			const batch = await cliBatch({
				actions: actionsPath,
				inDir,
				outDir,
				format,
				quality: options.quality ?? 92,
				timeoutMs: options.timeoutMs,
				signal: options.signal,
				cliPath: options.cliPath ?? resolveCliPath(options),
			})
			if (batch.succeeded === 0) {
				throw new Error(`batch 没有产出文件：${batch.failLines.join(" | ").slice(0, 300) || batch.stdout.trim().slice(0, 300)}`)
			}
			const produced = await findProduced(outDir, base, ext)
			if (!produced) throw new Error(`batch 报告成功但输出目录没有文件：${outDir}`)
			const finalPath = await relocate(produced, target)
			files.push({
				input: file,
				output: finalPath,
				ok: true,
				skipped: false,
				strokes: strokes.length,
				droppedStrokes: dropped,
				planPath,
				actionsPath,
				planSummary: {
					style,
					width: plan.image?.width ?? planResult.width ?? null,
					height: plan.image?.height ?? planResult.height ?? null,
					coverage: planResult.coverage ?? null,
				},
				batch: { succeeded: batch.succeeded, failed: batch.failed, seconds: batch.seconds },
				commands: actions.length,
				seconds: batch.seconds,
			})
			emitLog(logger, "info", `[dsh-photocraft] ${file} → ${finalPath}（${strokes.length} 笔，${batch.seconds.toFixed(2)}s）`)
		} catch (error) {
			files.push({ input: file, output: null, ok: false, skipped: false, strokes: 0, planPath, actionsPath, error: String(error?.message ?? error) })
			emitLog(logger, "warn", `[dsh-photocraft] 画笔作画失败 ${file}：${error?.message ?? error}`)
		} finally {
			await rm(join(workDir, stem), { recursive: true, force: true }).catch(() => {})
		}
	}
	const summary = summarize(files)
	// §4 附加字段：顶层也要有 strokes / planPath（pc-verify m00228、lead 裁定）。
	const totalStrokes = files.reduce((sum, item) => sum + (Number(item.strokes) || 0), 0)
	const planPaths = files.filter((item) => item.ok && item.planPath).map((item) => item.planPath)
	return {
		ok: summary.failed === 0 && !aborted,
		kind: "paint",
		input,
		output: job.singleFile || job.dir,
		dir: job.dir,
		files,
		summary,
		aborted,
		style,
		strokes: totalStrokes,
		planPath: planPaths[0] ?? null,
		planPaths,
		dirs: { plans: planDir },
		seconds: (Date.now() - started) / 1000,
	}
}
