// 功能2：一键抠图。主路径 layer.removeBackground（可选 refine）→ 去色污染 → 裁透明边。
import { resolveCliPath, cliRun } from "./cli.js"
import { emitLog, formatExt, outputPathFor, prepareJob, resolveWorkRoot } from "./paths.js"
import { summarize } from "./watermark.js"

export function cutoutSteps(options = {}) {
	const steps = [["layer.removeBackground", { sampleAllLayers: false, refine: options.refine !== false }]]
	if (options.decontaminate !== false) steps.push(["layer.matting.colorDecontaminate", { amount: 100, radius: 4 }])
	if (options.trim) steps.push(["image.trim", { basedOn: "transparent" }])
	return steps
}

/**
 * runCutout({ input, output, refine, decontaminate, trim, format, recursive, logger, signal })
 * → 同 runDewatermark 形状，额外字段 bounds / coverage。
 */
export async function runCutout(options = {}) {
	const started = Date.now()
	const input = options.input
	if (!input) throw new Error("runCutout 需要 input（单个图片或目录）")
	const format = options.format || "png"
	const ext = formatExt(format)
	const workRoot = resolveWorkRoot(options)
	const logger = options.logger
	const job = await prepareJob({ kind: "cutout", input, output: options.output, recursive: Boolean(options.recursive), workRoot, ext })
	const steps = cutoutSteps(options)
	const files = []
	let aborted = false
	for (const file of job.files) {
		if (options.signal?.aborted) {
			aborted = true
			break
		}
		const target = await outputPathFor(job, file, ext)
		try {
			const run = await cliRun({
				input: file,
				steps,
				output: target,
				format,
				quality: options.quality ?? 92,
				timeoutMs: options.timeoutMs,
				signal: options.signal,
				cliPath: options.cliPath ?? resolveCliPath(options),
			})
			const records = run.records ?? []
			const removeRecord = records.find((record) => record?.command === "layer.removeBackground")
			const trimRecord = records.find((record) => record?.command === "image.trim")
			files.push({
				input: file,
				output: target,
				ok: true,
				skipped: false,
				bounds: removeRecord?.result?.bounds ?? null,
				coverage: null,
				coverageNote: "photocraft-cli 未回报选区覆盖率，alpha 占比请用像素检查脚本统计",
				trimmed: trimRecord?.result ?? null,
				commands: records,
				seconds: run.seconds,
			})
		} catch (error) {
			files.push({ input: file, output: null, ok: false, skipped: false, bounds: null, coverage: null, error: String(error?.message ?? error) })
			emitLog(logger, "warn", `[dsh-photocraft] 抠图失败 ${file}：${error?.message ?? error}`)
		}
	}
	const summary = summarize(files)
	return {
		ok: summary.failed === 0 && !aborted,
		kind: "cutout",
		input,
		output: job.singleFile || job.dir,
		dir: job.dir,
		files,
		summary,
		aborted,
		steps: steps.map((step) => step[0]),
		seconds: (Date.now() - started) / 1000,
	}
}
