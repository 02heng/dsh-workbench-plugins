import { mkdir, rm } from "node:fs/promises"
import { createStore } from "./store.js"
import { registerDesk } from "./http.js"

const root = "D:/dsh-workbench/messenger/_test-http-keys"
await rm(root, { recursive: true, force: true })
await mkdir(root, { recursive: true })
const store = createStore(root)

const calls = []
const sidecar = {
	started: true,
	start() { this.started = true },
	async stop() { this.started = false; calls.push("stop") },
	running() { return this.started },
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
		writeHead(status, headers = {}) { this.status = status; this.headers = headers },
		end(body = "") { this.body = String(body) },
	}
}

function req({ method = "POST", headers = {}, body, remoteAddress = "127.0.0.1" } = {}) {
	const payload = body === undefined ? [] : [Buffer.from(JSON.stringify(body))]
	return {
		method,
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
const launched = []
const stopDesk = registerDesk(webServer, {
	store,
	root,
	sidecar,
	mail: {
		async snapshot() {
			return { configured: false, loggedIn: false, mailbox: "", error: "未配置 QQ 邮箱", pending: null }
		},
		async listMail() { return [] },
	},
	launchCollect(opts) {
		launched.push(opts)
		return { ok: true, pid: 9 }
	},
}, null)

try {
	const collectCsrf = res()
	await find("/plugins/dsh-messenger/wx/keys/collect").handler(req({
		headers: { host: "127.0.0.1:3080", origin: "http://evil.example" },
		body: {},
	}), collectCsrf)
	if (collectCsrf.status !== 403) {
		console.error("FAIL collect csrf", collectCsrf)
		process.exit(1)
	}

	const collect = res()
	await find("/plugins/dsh-messenger/wx/keys/collect").handler(req({
		headers: origin,
		body: {},
	}), collect)
	if (collect.status !== 200 || parsed(collect).collecting !== true || launched.length !== 1) {
		console.error("FAIL collect", collect, launched)
		process.exit(1)
	}
	const state = res()
	await find("/plugins/dsh-messenger/state").handler(req({ method: "GET" }), state)
	const snap = parsed(state)
	if (snap.keysStatus !== "collecting") {
		console.error("FAIL state collecting", snap)
		process.exit(1)
	}
	if (JSON.stringify(snap).includes("ab".repeat(32))) {
		console.error("FAIL state leaked key")
		process.exit(1)
	}

	const cleared = res()
	await find("/plugins/dsh-messenger/wx/keys/clear").handler(req({
		headers: origin,
		body: {},
	}), cleared)
	if (cleared.status !== 200 || parsed(cleared).ok !== true) {
		console.error("FAIL clear", cleared)
		process.exit(1)
	}
	if (!calls.includes("stop")) {
		console.error("FAIL clear should stop sidecar")
		process.exit(1)
	}
	stopDesk?.()
	await rm(root, { recursive: true, force: true })
	console.log("PASS http-keys")
} finally {
	stopDesk?.()
}
