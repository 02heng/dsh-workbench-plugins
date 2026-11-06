// pc-verify 端到端：fake ctx 加载插件 -> 真实调用工具 -> 真实跑 CLI/Python -> 像素断言。
// 运行：<bundled node> test/e2e.mjs   （可选环境变量 PC_CONFIG='{"root":"..."}'）
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import {
	callTool,
	CLI,
	ensureDir,
	findOutputFiles,
	outputFilesOf,
	loadPlugin,
	makeReporter,
	PLUGIN_DIR,
	PY,
	pythonCheck,
	run,
	SAMPLES,
	TMP_ROOT,
} from "./harness.mjs"

const CONFIG = process.env.PC_CONFIG ? JSON.parse(process.env.PC_CONFIG) : {}
const OUT = ensureDir(join(TMP_ROOT, "e2e"))
const reporter = makeReporter("e2e")
const E2E_T0 = Date.now()
const SIDECAR = join(PLUGIN_DIR, "sidecar")
const DETECT = join(SIDECAR, "detect_watermark.py")
const BRUSH_PLAN = join(SIDECAR, "brush_plan.py")

function parseJsonLoose(text) {
	const lines = String(text).split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
	for (let i = lines.length - 1; i >= 0; i--) {
		try { return JSON.parse(lines[i]) } catch { continue }
	}
	return null
}

function writeDetectJson(res, target) {
	const parsed = parseJsonLoose(res.stdout)
	if (!parsed) {
		writeFileSync(target, JSON.stringify({ ok: false, error: String(res.stderr || res.stdout).slice(0, 400) }))
		return null
	}
	writeFileSync(target, JSON.stringify(parsed))
	return parsed
}

function tail(text, n = 300) {
	const s = String(text ?? "").replace(/\s+/g, " ").trim()
	return s.length > n ? s.slice(0, n) + "..." : s
}

function batchOutputPath(stdout) {
	for (const line of String(stdout).split(/\r?\n/)) {
		const idx = line.indexOf("->")
		if (line.trim().startsWith("ok ") && idx > 0) return line.slice(idx + 2).trim()
	}
	return null
}

// ---------- A. 加载与注册 ----------
reporter.section("A. 插件加载与工具注册")
let plugin
try {
	plugin = await loadPlugin({ config: CONFIG })
} catch (error) {
	console.error("FATAL: 加载 lib/index.js 失败：")
	console.error(error?.stack ?? error)
	process.exit(2)
}
const { tools, logs } = plugin
reporter.check("apply/load", true, "lib/index.js 加载成功；config=" + JSON.stringify(CONFIG))
const EXPECTED_TOOLS = [
	"photocraft_status",
	"photocraft_dewatermark",
	"photocraft_cutout",
	"photocraft_brush_paint",
	"photocraft_run",
	"photocraft_commands",
]
for (const toolName of EXPECTED_TOOLS) {
	reporter.check("tool/" + toolName, tools.has(toolName), tools.has(toolName) ? "registered" : "missing; registered=" + [...tools.keys()].join(","))
}

// ---------- B. status ----------
reporter.section("B. photocraft_status")
const statusRes = await callTool(tools, "photocraft_status", {})
reporter.check("status/execute", statusRes.ok, statusRes.ok ? "" : tail(statusRes.error))
const status = statusRes.ok ? statusRes.value : null
const cliOk = Boolean(status?.cli?.ok)
const pyOk = Boolean(status?.python?.ok)
reporter.check("status/cli-ok", cliOk, "cli=" + JSON.stringify(status?.cli ?? null))
reporter.check("status/python-ok", pyOk, "python=" + JSON.stringify(status?.python ?? null))
// dirs.samples：pc-core 已改为「目录不存在就返回 null」（原先指向不存在的 samples/），这里两者都接受但打印实际值。
const statusSamples = status?.dirs?.samples ?? null
reporter.check(
	"status/dirs-samples",
	statusSamples === null || existsSync(statusSamples),
	"samples=" + JSON.stringify(statusSamples) + (statusSamples === null ? "（null = 目录不存在，符合修复后的契约）" : "（exists=" + existsSync(statusSamples) + "）"),
)
console.log("status = " + JSON.stringify(status))

// ---------- C. sidecar 检测契约（独立复验） ----------
reporter.section("C. sidecar detect_watermark 契约")
const detectWm = run(PY, [DETECT, "--image", join(SAMPLES, "bake-wm.png"), "--json"])
const wmJsonPath = join(OUT, "detect-bake-wm.json")
const wmDetected = writeDetectJson(detectWm, wmJsonPath)
reporter.check("detect/wm-exit", detectWm.ok, "exit=" + detectWm.status + " " + tail(detectWm.stderr))
if (wmDetected) {
	const wmCheck = pythonCheck(["detect", "--json", wmJsonPath, "--expect", "found", "--iou", "880,698,232,54", "--min-iou", "0.85"])
	reporter.check("detect/wm-found", wmCheck.ok, (wmCheck.json?.checks ?? []).map((c) => c.detail).join(" | ") || tail(wmCheck.stdout))
} else {
	reporter.check("detect/wm-found", false, "无法解析 detect 输出: " + tail(detectWm.stdout + detectWm.stderr))
}

const detectClean = run(PY, [DETECT, "--image", join(SAMPLES, "bake-clean.png"), "--json"])
const cleanJsonPath = join(OUT, "detect-bake-clean.json")
const cleanDetected = writeDetectJson(detectClean, cleanJsonPath)
reporter.check("detect/clean-exit", detectClean.ok, "exit=" + detectClean.status + " " + tail(detectClean.stderr))
if (cleanDetected) {
	const cleanCheck = pythonCheck(["detect", "--json", cleanJsonPath, "--expect", "not-found"])
	reporter.check("detect/clean-not-found", cleanCheck.ok, cleanCheck.json?.checks?.[0]?.detail ?? tail(cleanCheck.stdout))
} else {
	reporter.check("detect/clean-not-found", false, "无法解析 detect 输出: " + tail(detectClean.stdout + detectClean.stderr))
}

// ---------- D. 去水印 ----------
reporter.section("D. photocraft_dewatermark")
const wmOutFile = join(OUT, "wm-out.png")
const wmRes = await callTool(tools, "photocraft_dewatermark", {
	input: join(SAMPLES, "bake-wm.png"),
	output: wmOutFile,
	method: "fill",
	format: "png",
})
reporter.check("dewatermark/execute", wmRes.ok, wmRes.ok ? "" : tail(wmRes.error))
const wmFiles = wmRes.ok ? (outputFilesOf(wmRes.value).length ? outputFilesOf(wmRes.value) : findOutputFiles(wmRes.value)) : []
console.log("dewatermark result = " + JSON.stringify(wmRes.ok ? wmRes.value : wmRes.error).slice(0, 900))
reporter.check("dewatermark/output-exists", wmFiles.length > 0, "outputs=" + JSON.stringify(wmFiles))
if (wmFiles.length > 0) {
	const wmPixel = pythonCheck([
		"watermark",
		"--output", wmFiles[0],
		"--reference", join(SAMPLES, "bake-clean.png"),
		"--bbox", "880,698,232,54",
		"--max-mae", "4",
		"--max-full-mae", "4",
		"--unfixed", join(SAMPLES, "bake-wm.png"),
		"--min-delta", "1",
	])
	reporter.check("dewatermark/pixels", wmPixel.ok, (wmPixel.json?.checks ?? []).map((c) => c.detail).join(" | ") || tail(wmPixel.stdout + wmPixel.stderr))
}

const cleanWmRes = await callTool(tools, "photocraft_dewatermark", {
	input: join(SAMPLES, "bake-clean.png"),
	output: join(OUT, "wm-clean"),
	onMiss: "skip",
	format: "png",
})
const cleanSummary = cleanWmRes.ok ? cleanWmRes.value?.summary : null
const cleanFiles = cleanWmRes.ok ? (cleanWmRes.value?.files ?? []) : []
reporter.check(
	"dewatermark/clean-skip",
	cleanWmRes.ok && cleanFiles.length === 1 && cleanFiles[0].ok === false && Number(cleanSummary?.skipped ?? 0) >= 1,
	"summary=" + JSON.stringify(cleanSummary ?? null) + " error=" + tail(cleanWmRes.error),
)

// ---------- E. 抠图 ----------
reporter.section("E. photocraft_cutout")
const cutRes = await callTool(tools, "photocraft_cutout", {
	input: join(SAMPLES, "cutout-subject.png"),
	output: join(OUT, "cut-out.png"),
	refine: true,
	decontaminate: true,
	format: "png",
})
reporter.check("cutout/execute", cutRes.ok, cutRes.ok ? "" : tail(cutRes.error))
const cutFiles = cutRes.ok ? (outputFilesOf(cutRes.value).length ? outputFilesOf(cutRes.value) : findOutputFiles(cutRes.value)) : []
console.log("cutout result = " + JSON.stringify(cutRes.ok ? cutRes.value : cutRes.error).slice(0, 900))
reporter.check("cutout/output-exists", cutFiles.length > 0, "outputs=" + JSON.stringify(cutFiles))
if (cutFiles.length > 0) {
	const cutPixel = pythonCheck(["cutout", "--output", cutFiles[0], "--min-transparent", "0.5", "--center", "300,320"])
	reporter.check("cutout/pixels", cutPixel.ok, (cutPixel.json?.checks ?? []).map((c) => c.detail).join(" | ") || tail(cutPixel.stdout + cutPixel.stderr))
}

// ---------- F. 画笔 ----------
reporter.section("F. photocraft_brush_paint")
const paintOut = join(OUT, "paint-out.png")
const paintRes = await callTool(tools, "photocraft_brush_paint", {
	input: join(SAMPLES, "bake-clean.png"),
	output: paintOut,
	style: "impressionist",
	brushSize: 24,
	density: 1,
	passes: 2,
	jitter: 0.35,
	seed: 7,
	maxStrokes: 800,
	format: "png",
})
reporter.check("paint/execute", paintRes.ok, paintRes.ok ? "" : tail(paintRes.error))
const paintFiles = paintRes.ok ? outputFilesOf(paintRes.value) : []
// 规格 §4：strokes / planPath / planPaths 是 runBrushPaint 返回对象（顶层）的附加字段。
// 曾出现顶层缺失（只在 files[] 上）的契约偏差，pc-core 已于 2026-10-19 修复；现按顶层严格断言。
const paintFirst = Array.isArray(paintRes.value?.files) ? paintRes.value.files.find((f) => f?.ok) ?? paintRes.value.files[0] : null
const paintStrokes = paintRes.value?.strokes
const paintPlanPath = paintRes.value?.planPath
const paintPlanPaths = paintRes.value?.planPaths
console.log("paint result meta = " + JSON.stringify(paintRes.ok ? {
	strokesTop: paintStrokes ?? null,
	planPathTop: paintPlanPath ?? null,
	planPathsTop: Array.isArray(paintPlanPaths) ? paintPlanPaths.length : paintPlanPaths ?? null,
	strokesFromFiles0: paintFirst?.strokes ?? null,
	summary: paintRes.value?.summary,
	seconds: paintRes.value?.seconds,
} : paintRes.error))
reporter.check("paint/output-exists", paintFiles.length > 0, "outputs=" + JSON.stringify(paintFiles))
reporter.check(
	"paint/summary",
	paintRes.ok && Number(paintStrokes ?? 0) > 0 && Number(paintRes.value?.summary?.failed ?? 1) === 0,
	"顶层 strokes=" + String(paintStrokes ?? null) + " summary=" + JSON.stringify(paintRes.value?.summary ?? null),
)
reporter.check(
	"paint/top-level-fields",
	paintRes.ok &&
		Number.isFinite(paintStrokes) &&
		paintStrokes === paintFirst?.strokes &&
		typeof paintPlanPath === "string" &&
		existsSync(paintPlanPath) &&
		Array.isArray(paintPlanPaths) && paintPlanPaths.includes(paintPlanPath),
	"strokes=" + String(paintStrokes ?? null) + "===files[0].strokes(" + String(paintFirst?.strokes ?? null) + "); planPath=" +
		String(paintPlanPath ?? null) + " exists=" + (typeof paintPlanPath === "string" ? existsSync(paintPlanPath) : false) +
		"; planPaths=" + JSON.stringify(paintPlanPaths ?? null),
)
if (paintFiles.length > 0) {
	const paintPixel = pythonCheck(["paint", "--output", paintFiles[0], "--reference", join(SAMPLES, "bake-clean.png"), "--min-corr", "0.5"])
	reporter.check("paint/pixels", paintPixel.ok, (paintPixel.json?.checks ?? []).map((c) => c.detail).join(" | ") || tail(paintPixel.stdout + paintPixel.stderr))
}

// ---------- G. sidecar brush_plan 契约（确定性 / max-strokes / PSD 图层） ----------
reporter.section("G. sidecar brush_plan + PSD 图层")
const planA = join(OUT, "plan-a.json")
const planB = join(OUT, "plan-b.json")
const planArgs = (out) => [BRUSH_PLAN, "--image", join(SAMPLES, "bake-clean.png"), "--out", out, "--style", "impressionist", "--brush-size", "24", "--density", "1", "--passes", "2", "--jitter", "0.35", "--seed", "7", "--max-strokes", "800"]
const planARes = run(PY, planArgs(planA))
const planBRes = run(PY, planArgs(planB))
reporter.check("brush-plan/exit", planARes.ok && planBRes.ok, "exitA=" + planARes.status + " exitB=" + planBRes.status + " " + tail(planARes.stderr + planBRes.stderr))
if (planARes.ok && planBRes.ok && existsSync(planA) && existsSync(planB)) {
	const planCheck = pythonCheck(["plan", "--json", planA, "--max-strokes", "800"])
	reporter.check("brush-plan/valid", planCheck.ok, (planCheck.json?.checks ?? []).map((c) => c.detail).join(" | ") || tail(planCheck.stdout + planCheck.stderr))
	const same = readFileSync(planA, "utf8") === readFileSync(planB, "utf8")
	reporter.check("brush-plan/deterministic", same, same ? "同 seed 两次 plan 字节一致" : "两次 plan 不一致（确定性失败）")
	const planObj = JSON.parse(readFileSync(planA, "utf8"))
	const strokeCount = Array.isArray(planObj.strokes) ? planObj.strokes.length : -1
	reporter.check("brush-plan/count", strokeCount > 0 && strokeCount <= 800, "strokes=" + strokeCount)

	// PSD：按 plan 拼 actions.json 直接走 CLI batch，再用 info 验图层
	const psdIn = ensureDir(join(OUT, "psd-in"))
	const psdOutDir = ensureDir(join(OUT, "psd-out"))
	copyFileSync(join(SAMPLES, "bake-clean.png"), join(psdIn, "ref.png"))
	const actions = [["layer.new.layer", { name: "paint" }]]
	for (const stroke of planObj.strokes) actions.push(["paint.stroke", stroke])
	const actionsPath = join(OUT, "psd-actions.json")
	writeFileSync(actionsPath, JSON.stringify(actions))
	const batchRes = run(CLI, ["batch", "--actions", actionsPath, "--in", psdIn, "--out", psdOutDir, "--format", "psd"])
	const psdPath = batchOutputPath(batchRes.stdout)
	reporter.check("psd/batch", batchRes.ok && Boolean(psdPath) && existsSync(psdPath), "exit=" + batchRes.status + " out=" + String(psdPath) + " " + tail(batchRes.stdout + batchRes.stderr))
	if (psdPath && existsSync(psdPath)) {
		const infoRes = run(CLI, ["info", psdPath])
		let info = null
		try { info = JSON.parse(infoRes.stdout.trim()) } catch { info = parseJsonLoose(infoRes.stdout) }
		if (!info) {
			reporter.check("psd/layer-paint", false, "info 输出不是 JSON: " + tail(infoRes.stdout + infoRes.stderr))
		} else {
			const layerNames = JSON.stringify(info.layers ?? info).toLowerCase()
			reporter.check("psd/layer-paint", layerNames.includes("paint"), "layers=" + JSON.stringify(info.layers ?? null).slice(0, 400))
		}
	}
} else {
	reporter.check("brush-plan/valid", false, "brush_plan.py 未产出 plan.json")
	reporter.check("brush-plan/deterministic", false, "brush_plan.py 未产出 plan.json")
	reporter.check("brush-plan/count", false, "brush_plan.py 未产出 plan.json")
}

// ---------- H. commands 与 run 逃生通道 ----------
reporter.section("H. photocraft_commands / photocraft_run")
const cmdRes = await callTool(tools, "photocraft_commands", { filter: "paint.stroke" })
const cmdText = cmdRes.ok ? JSON.stringify(cmdRes.value) : ""
reporter.check("commands/execute", cmdRes.ok, cmdRes.ok ? "" : tail(cmdRes.error))
reporter.check("commands/has-paint-stroke", cmdText.includes("paint.stroke"), "结果长度=" + cmdText.length + " 片段=" + tail(cmdText, 200))

const runOut = join(OUT, "run-out.png")
const runRes = await callTool(tools, "photocraft_run", {
	input: join(SAMPLES, "bake-clean.png"),
	steps: [["layer.new.layer", { name: "verify" }]],
	output: runOut,
	format: "png",
})
reporter.check("run/execute", runRes.ok, runRes.ok ? "" : tail(runRes.error))
console.log("run result = " + JSON.stringify(runRes.ok ? runRes.value : runRes.error).slice(0, 700))

// ---------- I. 契约边界：目录递归 / 显式 region / 失败报错 / signal 中止 ----------
reporter.section("I. 契约边界")
const recIn = ensureDir(join(OUT, "rec-in"))
copyFileSync(join(SAMPLES, "bake-wm.png"), join(recIn, "a-wm.png"))
copyFileSync(join(SAMPLES, "cutout-subject.png"), join(recIn, "b-clean.png"))
const recOut = join(OUT, "rec-out")
const recArgs = { input: recIn, output: recOut, recursive: true, onMiss: "skip", format: "png" }
const rec1 = await callTool(tools, "photocraft_dewatermark", recArgs)
reporter.check("recursive/execute", rec1.ok, rec1.ok ? "" : tail(rec1.error))
reporter.check(
	"recursive/two-files",
	rec1.ok && rec1.value?.files?.length === 2 && rec1.value?.summary?.total === 2 && rec1.value?.summary?.skipped === 1,
	"files=" + (rec1.value?.files ?? []).map((f) => f.output + ":" + f.ok).join(",") + " summary=" + JSON.stringify(rec1.value?.summary ?? null),
)
const rec2 = await callTool(tools, "photocraft_dewatermark", recArgs)
reporter.check(
	"recursive/no-overwrite",
	rec2.ok && rec1.ok && rec2.value?.files?.[0]?.output !== rec1.value?.files?.[0]?.output && existsSync(rec2.value?.files?.[0]?.output ?? ""),
	"first=" + rec1.value?.files?.[0]?.output + " second=" + rec2.value?.files?.[0]?.output,
)

const regionOut = join(OUT, "region-out.png")
const regionRes = await callTool(tools, "photocraft_dewatermark", {
	input: join(SAMPLES, "bake-wm.png"),
	output: regionOut,
	region: "880,698,232,54",
	format: "png",
})
reporter.check("region/manual-execute", regionRes.ok && regionRes.value?.files?.[0]?.ok === true, regionRes.ok ? "regionSource=" + String(regionRes.value?.files?.[0]?.regionSource) : tail(regionRes.error))
const regionFile = regionRes.ok ? outputFilesOf(regionRes.value)[0] : null
if (regionFile) {
	const regionPixel = pythonCheck(["watermark", "--output", regionFile, "--reference", join(SAMPLES, "bake-clean.png"), "--bbox", "880,698,232,54", "--max-mae", "4", "--max-full-mae", "4"])
	reporter.check("region/manual-pixels", regionPixel.ok, (regionPixel.json?.checks ?? []).map((c) => c.detail).join(" | ") || tail(regionPixel.stdout + regionPixel.stderr))
} else {
	reporter.check("region/manual-pixels", false, "手动 region 未产出文件")
}

const missing = await callTool(tools, "photocraft_dewatermark", { input: join(SAMPLES, "definitely-missing.png") })
reporter.check("error/missing-input", !missing.ok && /输入不存在/.test(missing.error ?? ""), tail(missing.error, 160))
const badFormat = await callTool(tools, "photocraft_cutout", { input: join(SAMPLES, "cutout-subject.png"), format: "xyz" })
reporter.check("error/bad-format", !badFormat.ok && /不支持的输出格式/.test(badFormat.error ?? ""), tail(badFormat.error, 160))
const badMethod = await callTool(tools, "photocraft_dewatermark", { input: join(SAMPLES, "bake-wm.png"), method: "teleport" })
reporter.check("error/bad-method", !badMethod.ok && /未知清除方式/.test(badMethod.error ?? ""), tail(badMethod.error, 160))

const controller = new AbortController()
controller.abort()
const abortedRes = await callTool(tools, "photocraft_dewatermark", { input: join(SAMPLES, "bake-wm.png"), output: join(OUT, "abort.png"), format: "png" }, { signal: controller.signal })
reporter.check(
	"abort/pre-aborted",
	!abortedRes.ok || abortedRes.value?.ok === false || abortedRes.value?.aborted === true,
	"ok=" + abortedRes.ok + " value.aborted=" + String(abortedRes.value?.aborted) + " summary=" + JSON.stringify(abortedRes.value?.summary ?? null),
)

// ---------- I2. 内容保护：onMiss=corner 只允许改右下角那块 ----------
reporter.section("I2. 内容保护（bbox 外必须逐像素不变）")
const protectOut = join(OUT, "protect.png")
const protectRes = await callTool(tools, "photocraft_dewatermark", {
	input: join(SAMPLES, "bake-clean.png"),
	output: protectOut,
	onMiss: "corner",
	format: "png",
})
const protectBox = protectRes.ok ? protectRes.value?.files?.[0]?.bbox : null
reporter.check(
	"protect/execute",
	protectRes.ok && Array.isArray(protectBox) && protectBox.length === 4 && existsSync(protectOut),
	protectRes.ok
		? "bbox=" + JSON.stringify(protectBox ?? null) + " regionSource=" + String(protectRes.value?.files?.[0]?.regionSource)
		: tail(protectRes.error),
)
if (Array.isArray(protectBox) && protectBox.length === 4 && existsSync(protectOut)) {
	const protectCheck = pythonCheck([
		"protect",
		"--output", protectOut,
		"--reference", join(SAMPLES, "bake-clean.png"),
		"--bbox", protectBox.join(","),
		"--max-outside-mae", "0",
		"--unfixed", join(SAMPLES, "bake-clean.png"),
		"--min-delta", "1",
	])
	reporter.check(
		"protect/outside-untouched",
		protectCheck.ok,
		(protectCheck.json?.checks ?? []).map((c) => c.detail).join(" | ") || tail(protectCheck.stdout + protectCheck.stderr),
	)
} else {
	reporter.check("protect/outside-untouched", false, "onMiss=corner 未产出文件或 bbox 非法")
}

// ---------- J. 六种 style 独立 sweep ----------
reporter.section("J. brush_plan 六风格 sweep（独立复验，不采信转述）")
const STYLE_SWEEP = ["impressionist", "pointillist", "crosshatch", "ink", "pencil", "flat"]
const sweepArgs = (style, out) => [
	BRUSH_PLAN, "--image", join(SAMPLES, "photo-clean.png"), "--out", out,
	"--style", style, "--brush-size", "20", "--density", "1", "--passes", "2",
	"--jitter", "0.3", "--seed", "11", "--max-strokes", "1500",
]
for (const style of STYLE_SWEEP) {
	const outA = join(OUT, "sweep-" + style + "-a.json")
	const outB = join(OUT, "sweep-" + style + "-b.json")
	const resA = run(PY, sweepArgs(style, outA))
	const resB = run(PY, sweepArgs(style, outB))
	const parsed = parseJsonLoose(resA.stdout)
	const produced = resA.ok && existsSync(outA) && existsSync(outB)
	const planCheck = produced
		? pythonCheck(["plan", "--json", outA, "--max-strokes", "1500"])
		: { ok: false, json: null, stdout: "", stderr: "plan 未产出: " + tail(resA.stderr) }
	const same = produced && readFileSync(outA, "utf8") === readFileSync(outB, "utf8")
	const strokes = Number(parsed?.strokes ?? -1)
	reporter.check(
		"sweep/" + style,
		resA.ok && parsed?.ok === true && strokes > 0 && strokes <= 1500 && planCheck.ok && same,
		"strokes=" + strokes + " coverage=" + String(parsed?.coverage ?? null) + " seconds=" + String(parsed?.seconds ?? null) +
			" deterministic=" + same + " plan-valid=" + (planCheck.json?.checks ?? []).map((c) => c.name + ":" + c.ok).join(",") +
			(planCheck.ok ? "" : " " + tail(planCheck.stderr)),
	)
}

// ---------- 汇总 ----------
const elapsedSeconds = Number(((Date.now() - E2E_T0) / 1000).toFixed(2))
console.log("e2e total elapsed = " + elapsedSeconds + "s")
const warnLogs = logs.filter((entry) => entry.level === "warn" || entry.level === "error")
writeFileSync(join(TMP_ROOT, "e2e-report.json"), JSON.stringify({ title: "e2e", elapsedSeconds, rows: reporter.rows, logs: warnLogs }, null, 2))
if (warnLogs.length > 0) console.log("logger warns/errors = " + JSON.stringify(warnLogs).slice(0, 1200))
const ok = reporter.finish()
process.exitCode = ok ? 0 : 1