// pc-verify 网页工作台端到端：fake webServer 收集路由 -> 挂到真实 node:http -> fetch 全链路。
// 覆盖：页面/静态资源/api/status/upload/run/job/file + sameOrigin 403 + 路径越界拒绝。
import { createServer } from "node:http"
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import {
	ensureDir,
	fakeWebServer,
	loadPlugin,
	makeReporter,
	SAMPLES,
	TMP_ROOT,
} from "./harness.mjs"

const CONFIG = process.env.PC_CONFIG ? JSON.parse(process.env.PC_CONFIG) : {}
const OUT = ensureDir(join(TMP_ROOT, "web-e2e"))
const reporter = makeReporter("web-e2e")

function tail(text, n = 300) {
	const s = String(text ?? "").replace(/\s+/g, " ").trim()
	return s.length > n ? s.slice(0, n) + "..." : s
}

// ---------- 加载插件并收集 web 路由 ----------
reporter.section("A. 路由注册")
const routes = []
const webServer = fakeWebServer(routes)
let plugin
try {
	plugin = await loadPlugin({ config: CONFIG, services: { webServer } })
} catch (error) {
	console.error("FATAL: 加载 lib/index.js 失败：")
	console.error(error?.stack ?? error)
	process.exit(2)
}
reporter.check("apply/load", true, "工具=" + [...plugin.tools.keys()].join(","))
// Lead 裁定（2026-10-19）：lib/index.js 必须用顶层静态 import，apply() 返回时路由即已注册。
// 因此"返回瞬间路由存在"改为硬断言；若失败再轮询 2s 恢复，让后续链路仍能跑完并保留证据。
const ROUTES_MIN = 8
const immediateCount = routes.length
reporter.check(
	"routes/immediate-on-apply",
	immediateCount >= ROUTES_MIN,
	"apply() 返回瞬间 routes=" + immediateCount +
		(immediateCount >= ROUTES_MIN ? "（静态 import 生效）" : "（< " + ROUTES_MIN + "，疑似仍为异步注册）"),
)
if (routes.length < ROUTES_MIN) {
	const routesStart = Date.now()
	while (routes.length < ROUTES_MIN && Date.now() - routesStart < 2000) await new Promise((resolve) => setTimeout(resolve, 25))
	console.log("FALLBACK poll: routes settled after " + (Date.now() - routesStart) + "ms, count=" + routes.length)
}
const registered = routes.map((route) => route.path)
const EXPECTED_ROUTES = [
	"/plugins/dsh-photocraft/",
	"/plugins/dsh-photocraft/app.js",
	"/plugins/dsh-photocraft/style.css",
	"/plugins/dsh-photocraft/api/status",
	"/plugins/dsh-photocraft/api/upload",
	"/plugins/dsh-photocraft/api/run",
	"/plugins/dsh-photocraft/api/job",
	"/plugins/dsh-photocraft/file",
]
console.log("registered routes = " + JSON.stringify(registered))
for (const path of EXPECTED_ROUTES) {
	reporter.check("route" + path, registered.includes(path), registered.includes(path) ? "registered" : "missing")
}

// ---------- 起真实 HTTP 服务器 ----------
const server = createServer((req, res) => {
	let pathname = "/"
	try { pathname = new URL(req.url, "http://127.0.0.1").pathname } catch { pathname = "/" }
	const route = routes.find((candidate) => {
		if (candidate.kind === "prefix") return pathname.startsWith(candidate.path)
		return candidate.path === pathname
	})
	if (!route) {
		res.writeHead(404, { "content-type": "text/plain; charset=utf-8" })
		res.end("pc-verify: no route " + pathname)
		return
	}
	Promise.resolve().then(() => route.handler(req, res)).catch((error) => {
		try {
			if (!res.headersSent) res.writeHead(500, { "content-type": "text/plain; charset=utf-8" })
			res.end(String(error?.message ?? error))
		} catch { /* 响应已结束 */ }
	})
})
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
const BASE = "http://127.0.0.1:" + server.address().port
console.log("listening on " + BASE)

const ORIGIN = BASE
async function request(path, options = {}) {
	const response = await fetch(BASE + path, { ...options, headers: { ...(options.headers ?? {}) } })
	const buffer = Buffer.from(await response.arrayBuffer())
	return { status: response.status, headers: Object.fromEntries(response.headers.entries()), body: buffer, text: buffer.toString("utf8") }
}
async function json(path, options) {
	const res = await request(path, options)
	let parsed = null
	try { parsed = JSON.parse(res.text) } catch { parsed = null }
	return { ...res, json: parsed }
}

function buildMultipart(file) {
	const boundary = "----pcverify" + Date.now().toString(16)
	const chunks = []
	chunks.push(Buffer.from('--' + boundary + '\r\nContent-Disposition: form-data; name="file"; filename="' + file.name + '"\r\nContent-Type: ' + (file.type || "application/octet-stream") + '\r\n\r\n'))
	chunks.push(file.data)
	chunks.push(Buffer.from('\r\n--' + boundary + '--\r\n'))
	return { boundary, body: Buffer.concat(chunks) }
}

try {
	// ---------- B. 页面与静态资源 ----------
	reporter.section("B. 页面与静态资源")
	const page = await request("/plugins/dsh-photocraft/")
	reporter.check(
		"page/200",
		page.status === 200 && /text\/html/i.test(page.headers["content-type"] ?? "") && page.text.length > 200,
		"status=" + page.status + " type=" + page.headers["content-type"] + " bytes=" + page.body.length,
	)
	const mentions = ["去水印", "抠图", "画笔"].filter((word) => new RegExp(word).test(page.text))
	reporter.check(
		"page/mentions-tools",
		/dewatermark/i.test(page.text) && /cutout/i.test(page.text) && /paint|brush/i.test(page.text) && mentions.length === 3,
		"页面同时提到去水印/抠图/画笔；命中中文关键词=" + JSON.stringify(mentions),
	)
	const appJs = await request("/plugins/dsh-photocraft/app.js")
	reporter.check("app.js/200", appJs.status === 200 && /javascript/i.test(appJs.headers["content-type"] ?? "") && appJs.text.length > 200, "status=" + appJs.status + " type=" + appJs.headers["content-type"] + " bytes=" + appJs.body.length)
	const css = await request("/plugins/dsh-photocraft/style.css")
	reporter.check("style.css/200", css.status === 200 && /text\/css/i.test(css.headers["content-type"] ?? "") && css.text.length > 100, "status=" + css.status + " type=" + css.headers["content-type"] + " bytes=" + css.body.length)

	// ---------- C. status ----------
	reporter.section("C. /api/status")
	const status = await json("/plugins/dsh-photocraft/api/status")
	reporter.check("status/200", status.status === 200 && status.json !== null, "status=" + status.status + " " + tail(status.text))
	if (status.json) {
		reporter.check("status/cli", Boolean(status.json.cli), "cli=" + JSON.stringify(status.json.cli ?? null))
		reporter.check("status/python", Boolean(status.json.python), "python=" + JSON.stringify(status.json.python ?? null))
	}

	// ---------- D. upload ----------
	reporter.section("D. /api/upload")
	const image = readFileSync(join(SAMPLES, "bake-clean.png"))
	const modern = buildMultipart({ name: "bake-clean.png", data: image, type: "image/png" })
	const upload = await json("/plugins/dsh-photocraft/api/upload", {
		method: "POST",
		headers: { "content-type": "multipart/form-data; boundary=" + modern.boundary, origin: ORIGIN },
		body: modern.body,
	})
	reporter.check("upload/200", upload.status === 200 && upload.json !== null, "status=" + upload.status + " " + tail(upload.text))
	const uploadedPath = upload.json?.path ?? upload.json?.file ?? upload.json?.id ?? null
	console.log("upload = " + JSON.stringify(upload.json ?? upload.text).slice(0, 500))
	reporter.check("upload/has-path", typeof uploadedPath === "string" && uploadedPath.length > 0, "uploadedPath=" + String(uploadedPath))

	// ---------- E. sameOrigin 403 ----------
	reporter.section("E. sameOrigin 校验")
	const noOrigin = await json("/plugins/dsh-photocraft/api/upload", {
		method: "POST",
		headers: { "content-type": "multipart/form-data; boundary=" + modern.boundary },
		body: modern.body,
	})
	// 信息性记录：dsh-datacenter 参考实现要求 Origin 存在，本插件 http.js 在缺失 Origin/Referer 时
	// 回落到 host 判断（非浏览器客户端也能调）。跨域 Origin 仍是硬 403，下面单独断言。
	console.log("INFO upload/no-origin status=" + noOrigin.status + " body=" + tail(noOrigin.text, 120))
	const evilOrigin = await json("/plugins/dsh-photocraft/api/upload", {
		method: "POST",
		headers: { "content-type": "multipart/form-data; boundary=" + modern.boundary, origin: "http://evil.example" },
		body: modern.body,
	})
	reporter.check("upload/evil-origin-403", evilOrigin.status === 403, "status=" + evilOrigin.status + " " + tail(evilOrigin.text))

	// ---------- F. run + job ----------
	reporter.section("F. /api/run -> /api/job")
	let jobId = null
	if (uploadedPath) {
		const runRes = await json("/plugins/dsh-photocraft/api/run", {
			method: "POST",
			headers: { "content-type": "application/json", origin: ORIGIN },
			body: JSON.stringify({ kind: "cutout", files: [uploadedPath], options: {} }),
		})
		reporter.check("run/200", runRes.status === 200 && typeof runRes.json?.jobId === "string", "status=" + runRes.status + " " + tail(runRes.text))
		jobId = runRes.json?.jobId ?? null
	} else {
		reporter.check("run/200", false, "没有可用的上传路径，跳过 run")
	}

	let job = null
	if (jobId) {
		const deadline = Date.now() + 150_000
		while (Date.now() < deadline) {
			const poll = await json("/plugins/dsh-photocraft/api/job?id=" + encodeURIComponent(jobId))
			job = poll.json
			if (job && (job.state === "done" || job.state === "failed")) break
			await new Promise((resolve) => setTimeout(resolve, 500))
		}
		console.log("job = " + JSON.stringify(job ?? null).slice(0, 900))
		reporter.check("job/done", job?.state === "done", "state=" + String(job?.state) + " error=" + String(job?.error ?? ""))
		reporter.check("job/results", Array.isArray(job?.results) && job.results.length > 0, "results=" + JSON.stringify(job?.results ?? null).slice(0, 400))
	}

	// ---------- G. file 预览 + 越界拒绝 ----------
	reporter.section("G. /file 预览与路径越界")
	let resultUrl = job?.results?.[0]?.url ?? null
	if (!resultUrl) {
		const resultPath = job?.results?.[0]?.path ?? job?.results?.[0]?.meta?.output ?? job?.results?.[0]?.output ?? null
		if (resultPath) resultUrl = "/plugins/dsh-photocraft/file?path=" + encodeURIComponent(resultPath)
	}
	if (resultUrl) {
		const fileRes = await request(resultUrl)
		reporter.check("file/200", fileRes.status === 200 && fileRes.body.length > 500, "status=" + fileRes.status + " bytes=" + fileRes.body.length + " type=" + fileRes.headers["content-type"])
	} else {
		reporter.check("file/200", false, "job 没有给出结果文件 url/path")
	}

	const traversalPath = "/plugins/dsh-photocraft/file?path=" + encodeURIComponent("../../../../Windows/win.ini")
	const traversal = await request(traversalPath)
	reporter.check("file/traversal-blocked", traversal.status !== 200, "status=" + traversal.status + " bytes=" + traversal.body.length)
	const absolutePath = "/plugins/dsh-photocraft/file?path=" + encodeURIComponent("C:/Windows/win.ini")
	const absolute = await request(absolutePath)
	reporter.check("file/absolute-blocked", absolute.status !== 200, "status=" + absolute.status + " bytes=" + absolute.body.length)
	const outside = "/plugins/dsh-photocraft/file?path=" + encodeURIComponent("D:/dsh-workbench/tmp/psv/bake-clean.png")
	const outsideRes = await request(outside)
	reporter.check("file/outside-work-blocked", outsideRes.status !== 200, "status=" + outsideRes.status + " bytes=" + outsideRes.body.length)
} finally {
	await new Promise((resolve) => server.close(resolve))
}

const ok = reporter.finish()
writeFileSync(join(TMP_ROOT, "web-e2e-report.json"), JSON.stringify({ title: "web-e2e", rows: reporter.rows }, null, 2))
process.exitCode = ok ? 0 : 1