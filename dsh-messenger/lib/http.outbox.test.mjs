import { mkdir, rm } from "node:fs/promises"
import { createStore } from "./store.js"
import { enqueueOut } from "./outbox.js"
import { registerDesk } from "./http.js"

const root = "D:/dsh-workbench/messenger/_test-http-outbox"
await rm(root, { recursive: true, force: true })
await mkdir(root, { recursive: true })
const store = createStore(root)

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

function req({ method = "GET", headers = {}, body, remoteAddress = "127.0.0.1" } = {}) {
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

const api = {
	sessions: {
		async create() { return { ok: true, value: { sessionId: "sess-http" } } },
		async prompt() { return { ok: true, value: { accepted: true } } },
		async rename(req) { return { ok: true, value: { title: req.payload.title, seq: 1 } } },
	},
}

const stopDesk = registerDesk(webServer, { store, root }, api)
try {
	const outboxRoute = find("/plugins/dsh-messenger/wx/outbox")
	const ackRoute = find("/plugins/dsh-messenger/wx/outbox/ack")
	const retryRoute = find("/plugins/dsh-messenger/task/retry")
	if (!outboxRoute || !ackRoute || !retryRoute) {
		console.error("FAIL routes", [...routes.keys()])
		process.exit(1)
	}

await enqueueOut(store, {
	type: "text",
	to: "黄山",
	text: "任务 T-0815-09 未完成：error",
	taskId: "T-0815-09",
})

const forbidden = res()
await outboxRoute.handler(req({ remoteAddress: "8.8.8.8" }), forbidden)
if (forbidden.status !== 403) {
	console.error("FAIL outbox remote", forbidden)
	process.exit(1)
}

const takenRes = res()
await outboxRoute.handler(req(), takenRes)
const taken = parsed(takenRes)
if (takenRes.status !== 200 || !Array.isArray(taken) || taken.length !== 1 || taken[0].status !== "taken") {
	console.error("FAIL outbox take", takenRes.status, taken)
	process.exit(1)
}

const ackForbidden = res()
await ackRoute.handler(req({
	method: "POST",
	body: { id: taken[0].id, ok: true },
	remoteAddress: "8.8.8.8",
}), ackForbidden)
if (ackForbidden.status !== 403) {
	console.error("FAIL ack remote", ackForbidden)
	process.exit(1)
}

const ackRes = res()
await ackRoute.handler(req({ method: "POST", body: { id: taken[0].id, ok: true } }), ackRes)
if (ackRes.status !== 200 || parsed(ackRes).status !== "sent") {
	console.error("FAIL ack", ackRes)
	process.exit(1)
}

const csrf = res()
await retryRoute.handler(req({
	method: "POST",
	headers: { host: "127.0.0.1:3080", origin: "http://evil.example" },
	body: { id: "T-0815-01", mode: "dispatch" },
}), csrf)
if (csrf.status !== 403) {
	console.error("FAIL retry csrf", csrf)
	process.exit(1)
}

await store.appendItem({
	id: "T-0815-01",
	from: "黄山",
	text: "任务: 备忘",
	prompt: "备忘",
	kind: "text",
	action: "dispatch",
	status: "dispatch-failed",
})
const retryOk = res()
await retryRoute.handler(req({
	method: "POST",
	headers: { host: "127.0.0.1:3080", origin: "http://127.0.0.1:3080" },
	body: { id: "T-0815-01", mode: "dispatch" },
}), retryOk)
const retried = parsed(retryOk)
if (retryOk.status !== 200 || retried.status !== "running" || retried.id === "T-0815-01") {
	console.error("FAIL retry dispatch", retryOk.status, retried)
	process.exit(1)
}

stopDesk?.()
await rm(root, { recursive: true, force: true })
console.log("PASS http-outbox")
} finally {
	stopDesk?.()
}
