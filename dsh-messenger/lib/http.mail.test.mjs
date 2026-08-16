import { mkdir, rm } from "node:fs/promises"
import { createStore } from "./store.js"
import { registerDesk } from "./http.js"
import { deskHtml } from "./desk.js"

const root = "D:/dsh-workbench/messenger/_test-http-mail"
await rm(root, { recursive: true, force: true })
await mkdir(root, { recursive: true })
const store = createStore(root)

function fail(msg) {
	console.error("FAIL", msg)
	process.exit(1)
}

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
			this.body = String(body)
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
	return JSON.parse(response.body)
}

const origin = { host: "127.0.0.1:3080", origin: "http://127.0.0.1:3080" }
const mail = {
	async startDeviceLogin(input = {}) {
		return {
			ok: true,
			mailbox: input.user || "desk@qq.com",
			message: "信匣已接通",
		}
	},
	async pollDeviceLogin() { return { ok: true, mailbox: "desk@qq.com" } },
	async listMail() {
		return [{ id: "msg-1", subject: "值班", from: "src@example.com", at: "2026-08-15T12:00:00Z" }]
	},
	async readMail(id) {
		return { id, subject: "值班", from: "src@example.com", at: "2026-08-15T12:00:00Z", body: "正文一段" }
	},
	async sendMail() { throw new Error("smtp down") },
	async logout() { return { ok: true } },
	async snapshot() {
		return { configured: true, loggedIn: true, mailbox: "desk@qq.com", error: "", pending: null }
	},
}

const stopDesk = registerDesk(webServer, { store, root, mail, sidecar: null }, null)
try {
	const login = find("/plugins/dsh-messenger/mail/login")
	const list = find("/plugins/dsh-messenger/mail/list")
	const read = find("/plugins/dsh-messenger/mail/read")
	const draft = find("/plugins/dsh-messenger/mail/draft")
	const send = find("/plugins/dsh-messenger/mail/send")
	const logout = find("/plugins/dsh-messenger/mail/logout")
	if (!login || !list || !read || !draft || !send || !logout) {
		fail("routes " + [...routes.keys()].join(","))
	}

	const csrf = res()
	await send.handler(req({
		method: "POST",
		headers: { host: "127.0.0.1:3080", origin: "http://evil.example" },
		body: { to: "a@b.com", subject: "s", body: "keep-me" },
	}), csrf)
	if (csrf.status !== 403) fail("send csrf")

	const sendFail = res()
	await send.handler(req({
		method: "POST",
		headers: origin,
		body: { to: "a@b.com", subject: "s", body: "keep-me" },
	}), sendFail)
	const sent = parsed(sendFail)
	if (sent.ok !== false || !String(sent.error).includes("smtp down") || sent.draft?.body !== "keep-me") {
		fail("send keeps draft")
	}

	const loginOk = res()
	await login.handler(req({ method: "POST", headers: origin, body: { user: "desk@qq.com", auth: "auth-code" } }), loginOk)
	const started = parsed(loginOk)
	if (loginOk.status !== 200 || started.ok !== true || started.mailbox !== "desk@qq.com") fail("login")
	if (JSON.stringify(started).includes("auth-code") || JSON.stringify(started).includes("access")) {
		fail("login leaked secret")
	}

	const listOk = res()
	await list.handler(req({ headers: origin }), listOk)
	if (listOk.status !== 200 || parsed(listOk).mail?.[0]?.id !== "msg-1") fail("list")

	const readOk = res()
	await read.handler(req({ headers: origin, url: "/plugins/dsh-messenger/mail/read?id=msg-1" }), readOk)
	if (parsed(readOk).id !== "msg-1" || parsed(readOk).body !== "正文一段") fail("read")

	const stateRoute = find("/plugins/dsh-messenger/state")
	const stateRes = res()
	await stateRoute.handler(req({ headers: origin }), stateRes)
	const state = parsed(stateRes)
	const dumped = JSON.stringify(state)
	if (dumped.includes("access-test") || dumped.includes("refresh-test") || dumped.includes("access_token")) {
		fail("state leaked token")
	}
	if (state.mailLoggedIn !== true || state.mailbox !== "desk@qq.com") fail("state logged in")

	let listThrows = null
	const resilientMail = {
		...mail,
		async listMail() {
			if (listThrows) throw listThrows
			return [{ id: "msg-1", subject: "值班", from: "src@example.com", at: "2026-08-15T12:00:00Z" }]
		},
	}
	stopDesk?.()
	const stopResilient = registerDesk(webServer, { store, root, mail: resilientMail, sidecar: null }, null)
	const stateRoute2 = find("/plugins/dsh-messenger/state")
	const warmRes = res()
	await stateRoute2.handler(req({ headers: origin }), warmRes)
	if (parsed(warmRes).mail?.[0]?.id !== "msg-1") fail("warm list cache")

	listThrows = new Error("429")
	const transientRes = res()
	await stateRoute2.handler(req({ headers: origin }), transientRes)
	const transient = parsed(transientRes)
	if (!transient.mailLoggedIn || transient.mailbox !== "desk@qq.com") fail("429 keeps logged in")
	if (transient.mail?.[0]?.id !== "msg-1") fail("429 keeps last-known mail")
	if (!String(transient.mailError).includes("429")) fail("429 error for toast")

	const logoutRoute = find("/plugins/dsh-messenger/mail/logout")
	const logoutRes = res()
	await logoutRoute.handler(req({ method: "POST", headers: origin, body: {} }), logoutRes)
	if (logoutRes.status !== 200) fail("logout route")

	resilientMail.snapshot = async () => ({
		configured: true, loggedIn: true, mailbox: "new@qq.com", error: "", pending: null,
	})
	listThrows = new Error("429")
	const afterLogoutRes = res()
	await stateRoute2.handler(req({ headers: origin }), afterLogoutRes)
	const afterLogout = parsed(afterLogoutRes)
	if (afterLogout.mail?.length) fail("logout clears lastKnownMail on 429")
	if (!String(afterLogout.mailError).includes("429")) fail("429 after logout shows error")

	listThrows = new Error("QQ 邮箱登录失败")
	const authRes = res()
	await stateRoute2.handler(req({ headers: origin }), authRes)
	const authState = parsed(authRes)
	if (authState.mailLoggedIn !== false || authState.mailbox) fail("auth list failure logs out")
	stopResilient?.()

	const unconfigured = {
		async startDeviceLogin() { throw new Error("未配置 QQ 邮箱") },
		async pollDeviceLogin() { throw new Error("未配置 QQ 邮箱") },
		async listMail() { throw new Error("未配置 QQ 邮箱") },
		async readMail() { throw new Error("未配置 QQ 邮箱") },
		async sendMail() { throw new Error("未配置 QQ 邮箱") },
		async logout() { throw new Error("未配置 QQ 邮箱") },
		async snapshot() {
			return { configured: false, loggedIn: false, mailbox: "", error: "未配置 QQ 邮箱", pending: null }
		},
	}
	stopDesk?.()
	const stop2 = registerDesk(webServer, { store, root, mail: unconfigured, sidecar: null }, null)
	const loginMissing = find("/plugins/dsh-messenger/mail/login")
	const missingRes = res()
	await loginMissing.handler(req({ method: "POST", headers: origin, body: {} }), missingRes)
	const missing = parsed(missingRes)
	if (!String(missing.error ?? missing.message ?? "").includes("未配置 QQ 邮箱")) {
		fail("unconfigured login")
	}
	stop2?.()

	const loggedOutDesk = deskHtml({ listen: false, items: [], mail: [], mailLoggedIn: false })
	if (!loggedOutDesk.includes("openMailId = ''") || !loggedOutDesk.includes("lastFrom = ''")) {
		fail("desk paint clears mail session ids")
	}
	if (!loggedOutDesk.includes("pane.hidden = true") || !loggedOutDesk.includes("pane.classList.add('is-hidden')")) {
		fail("desk paint hides mail-read")
	}
	if (loggedOutDesk.includes("getElementById('to').value = ''")) fail("desk paint must keep compose")

	await rm(root, { recursive: true, force: true })
	console.log("PASS http-mail")
} finally {
	stopDesk?.()
}
