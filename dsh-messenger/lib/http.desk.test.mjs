import { mkdir, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { createStore } from "./store.js"
import { registerDesk } from "./http.js"
import { deskHtml } from "./desk.js"

const root = "D:/dsh-workbench/messenger/_test-http-desk"
await rm(root, { recursive: true, force: true })
await mkdir(join(root, "shots"), { recursive: true })
const store = createStore(root)

function fail(msg) {
	console.error("FAIL", msg)
	process.exit(1)
}

const PNG = Buffer.from(
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
	"base64",
)

const routes = new Map()
const webServer = {
	register(def) {
		routes.set(`${def.kind}:${def.path}`, def)
		return () => routes.delete(`${def.kind}:${def.path}`)
	},
}

function find(path) {
	return routes.get(`exact:${path}`)
}

function res() {
	return {
		status: 0,
		headers: {},
		body: "",
		writeHead(status, headers = {}) {
			this.status = status
			this.headers = headers
		},
		end(body = "") {
			this.body = body
		},
	}
}

function req({ method = "GET", headers = {}, body, remoteAddress = "127.0.0.1", url = "/" } = {}) {
	const payload = body === undefined ? [] : [Buffer.from(JSON.stringify(body))]
	return {
		method,
		url,
		headers,
		socket: { remoteAddress },
		async *[Symbol.asyncIterator]() {
			for (const chunk of payload) yield chunk
		},
	}
}

function parsed(response) {
	return JSON.parse(String(response.body))
}

const origin = { host: "127.0.0.1:3080", origin: "http://127.0.0.1:3080" }
const sidecar = {
	started: true,
	start() { this.started = true },
	async stop() { this.started = false },
	running() { return this.started },
}

const stopDesk = registerDesk(webServer, { store, root, sidecar, mail: {
	async snapshot() {
		return { configured: false, loggedIn: false, mailbox: "", error: "未配置 QQ 邮箱", pending: null }
	},
	async startDeviceLogin() { throw new Error("未配置 QQ 邮箱") },
	async pollDeviceLogin() { return { pending: false } },
	async listMail() { return [] },
	async logout() { return { ok: true } },
} }, null)

try {
	const deleteRoute = find("/plugins/dsh-messenger/item/delete")
	const shotRoute = find("/plugins/dsh-messenger/shot")
	const listenRoute = find("/plugins/dsh-messenger/wx/listen")
	if (!deleteRoute || !shotRoute || !listenRoute) {
		fail("routes " + [...routes.keys()].join(","))
	}

	const csrf = res()
	await deleteRoute.handler(req({
		method: "POST",
		headers: { host: "127.0.0.1:3080", origin: "http://evil.example" },
		body: { id: "T-0815-01" },
	}), csrf)
	if (csrf.status !== 403) fail("delete csrf")

	await store.appendItem({
		id: "T-0815-01",
		from: "黄山",
		text: "你好",
		kind: "text",
		action: "record",
		status: "recorded",
		prompt: "你好",
	})
	await store.appendItem({
		id: "T-0815-02",
		from: "黄山",
		text: "任务: 备忘",
		kind: "text",
		action: "dispatch",
		status: "replied",
		prompt: "备忘",
		title: "微信·黄山·T-0815-02",
	})

	const deleted = res()
	await deleteRoute.handler(req({
		method: "POST",
		headers: origin,
		body: { id: "T-0815-01" },
	}), deleted)
	const deletedBody = parsed(deleted)
	if (deleted.status !== 200 || deletedBody.ok !== true) fail("delete ok " + deleted.body)
	const listed = await store.listItems()
	if (listed.length !== 1 || listed[0].id !== "T-0815-02") fail("delete remaining " + JSON.stringify(listed))

	const missing = res()
	await deleteRoute.handler(req({
		method: "POST",
		headers: origin,
		body: { id: "T-0815-01" },
	}), missing)
	if (missing.status !== 400 || !String(parsed(missing).error).includes("没有任务")) {
		fail("delete missing " + missing.body)
	}

	await writeFile(join(root, "shots", "T-0815-02.png"), PNG)
	const shotOk = res()
	await shotRoute.handler(req({
		headers: origin,
		url: "/plugins/dsh-messenger/shot?id=T-0815-02",
	}), shotOk)
	if (shotOk.status !== 200) fail("shot status " + shotOk.status)
	if (!String(shotOk.headers["content-type"] || "").includes("image/png")) {
		fail("shot content-type " + JSON.stringify(shotOk.headers))
	}
	const shotBuf = Buffer.isBuffer(shotOk.body) ? shotOk.body : Buffer.from(shotOk.body)
	if (shotBuf[0] !== 0x89 || shotBuf[1] !== 0x50 || shotBuf.length !== PNG.length) {
		fail("shot bytes")
	}
	const dest = join(root, "shots", "T-0815-02.png")
	if (!dest.replaceAll("\\", "/").includes("dsh-workbench/messenger") || !dest.replaceAll("\\", "/").includes("/shots/")) {
		fail("shot path not under messenger shots")
	}

	const traversal = res()
	await shotRoute.handler(req({
		headers: origin,
		url: "/plugins/dsh-messenger/shot?id=..%2Fconfig",
	}), traversal)
	if (traversal.status === 200 && String(traversal.headers["content-type"] || "").includes("image/png")) {
		fail("shot traversal served png")
	}
	if (traversal.status < 400) fail("shot traversal status " + traversal.status)

	const slash = res()
	await shotRoute.handler(req({
		headers: origin,
		url: "/plugins/dsh-messenger/shot?id=..\\..\\windows",
	}), slash)
	if (slash.status < 400) fail("shot slash status " + slash.status)

	const absent = res()
	await shotRoute.handler(req({
		headers: origin,
		url: "/plugins/dsh-messenger/shot?id=T-0000-00",
	}), absent)
	if (absent.status !== 404) fail("shot missing " + absent.status)

	const listenOff = res()
	await listenRoute.handler(req({
		method: "POST",
		headers: origin,
		body: { on: false },
	}), listenOff)
	const listenBody = parsed(listenOff)
	if (listenOff.status !== 200 || listenBody.on !== false || listenBody.running !== false) {
		fail("listen off " + listenOff.body)
	}

	const html = deskHtml({
		listen: false,
		items: [{
			id: "T-0815-02",
			text: "任务: 备忘",
			title: "微信·黄山·T-0815-02",
			status: "replied",
			action: "dispatch",
			at: "2026-08-15T12:00:00Z",
		}],
		mail: [],
		mailLoggedIn: false,
		mailConfigured: false,
		mailError: "未配置 QQ 邮箱",
	})
	if (!html.includes("QQ 邮箱")) fail("desk qq mailbox")
	if (!html.includes("接通信匣")) fail("desk connect")
	if (!html.includes("id=\"qq-form\"") || !html.includes("id=\"qq-auth\"")) fail("desk qq form")
	if (html.includes("Outlook") || html.includes("OUTLOOK") || html.includes("设备码")) fail("desk leftover outlook")
	if (!html.includes("信使")) fail("desk 信使")
	if (!html.includes("黄山专线")) fail("desk 黄山专线")
	if (!html.includes("个人微信自动化有风控，PC 微信须登录")) fail("desk risk note")
	if (!html.includes("已回图")) fail("desk replied label")
	if (!html.includes("微信·黄山·T-0815-02")) fail("desk session title")
	if (!html.includes("任务: 备忘")) fail("desk original text")
	if (!html.includes("/plugins/dsh-messenger/shot?id=T-0815-02")) fail("desk shot thumb")
	if (!html.includes("/plugins/dsh-messenger/wx/listen")) fail("desk listen post")
	if (!html.includes("/plugins/dsh-messenger/task/retry")) fail("desk retry post")
	if (!html.includes("/plugins/dsh-messenger/item/delete")) fail("desk delete post")
	if (!html.includes('mode: "dispatch"') && !html.includes("mode: 'dispatch'")) fail("desk retry dispatch")
	if (!html.includes('mode: "shot"') && !html.includes("mode: 'shot'")) fail("desk retry shot")
	if (html.includes("function later(") || html.includes("later('")) fail("desk later stub")
	if (!html.includes("确认删除")) fail("desk two-step copy")
	if (!html.includes("armedId")) fail("desk paint restores armedId")
	if (!html.includes("restoreArmedDelete") || !html.includes("is-armed")) fail("desk paint restores armed state")
	if (!html.includes("3000") && !html.includes("3 * 1000") && !html.includes("3e3") && !html.includes("ARM_MS")) fail("desk 3s disarm")
	if (html.includes("台账样张")) fail("desk sample delete")
	if (!html.includes("recorded") || !html.includes("仅记录")) fail("desk recorded label")
	if (!html.includes("empty-password") || !html.includes("口令空")) fail("desk empty-password label")
	if (!html.includes("queued") || !html.includes("排队")) fail("desk queued label")
	if (!html.includes("running") || !html.includes("在跑")) fail("desk running label")
	if (!html.includes("dispatch-failed") || !html.includes("派活失败")) fail("desk dispatch-failed label")
	if (!html.includes("shot-failed") || !html.includes("回图失败")) fail("desk shot-failed label")
	if (!html.includes("replying") || !html.includes("回图中")) fail("desk replying label")
	if (!html.includes("listenError") || !html.includes("lastListenError")) fail("desk listenError toast")
	if (!html.includes("/plugins/dsh-messenger/wx/keys/collect")) fail("desk collect post")
	if (!html.includes("采集密钥")) fail("desk collect label")
	if (html.includes("`请求失败")) fail("desk nested template broke script")
	if (!html.includes("/plugins/dsh-messenger/wx/keys/collect")) fail("desk collect post")
	if (!html.includes("采集密钥")) fail("desk collect label")
	if (html.includes("`请求失败")) fail("desk nested template broke script")
	if (!html.includes("2026-08-15 20:00:00")) fail("desk beijing clock")
	if (html.includes("2026-08-15 12:00:00")) fail("desk must not show utc clock")
	if (!html.includes("ledger-scroll") || !html.includes("overflow-y:auto")) fail("desk ledger scroll")
	if (!html.includes("mail-list") || !html.includes("paper-scroll")) fail("desk mail paper-scroll")
	if (!html.includes("visibilityState") || !html.includes("hidden")) fail("desk poll pauses when hidden")
	if (!html.includes('loading="lazy"') && !html.includes("loading: 'lazy'") && !html.includes('loading: "lazy"')) {
		fail("desk shot lazy")
	}
	if (!html.includes("lastItemsFp") || !html.includes("itemsFingerprint")) fail("desk quiet refresh")
	if (html.includes(".slip{") && html.includes("animation:rise") && !html.includes("animation:none")) {
		fail("desk slip should not rise every poll")
	}

	const slowRoot = "D:/dsh-workbench/messenger/_test-http-desk-fast"
	await rm(slowRoot, { recursive: true, force: true })
	await mkdir(join(slowRoot, "shots"), { recursive: true })
	let listCalls = 0
	const stopSlow = registerDesk(webServer, {
		store: createStore(slowRoot),
		root: slowRoot,
		sidecar,
		mail: {
			async snapshot() {
				return { configured: true, loggedIn: true, mailbox: "desk@qq.com", error: "", pending: null }
			},
			async startDeviceLogin() { return { pending: true } },
			async pollDeviceLogin() { return { pending: false } },
			async listMail() {
				listCalls += 1
				await new Promise(() => {})
				return [{ id: "1", subject: "卡住" }]
			},
			async logout() { return { ok: true } },
		},
	})
	const page = res()
	const started = Date.now()
	await Promise.race([
		find("/plugins/dsh-messenger/desk").handler(req({ headers: origin }), page),
		new Promise((_, reject) => setTimeout(() => reject(new Error("desk hung on imap")), 800)),
	]).catch((error) => fail(error.message))
	if (Date.now() - started > 800) fail("desk html waited on imap")
	if (page.status !== 200 || !String(page.body).includes("信使")) fail("desk html without imap")
	if (listCalls !== 0) fail("desk html must not open IMAP")
	stopSlow?.()
	await rm(slowRoot, { recursive: true, force: true })

	stopDesk?.()
	await rm(root, { recursive: true, force: true })
	console.log("PASS http-desk")
} finally {
	stopDesk?.()
}
