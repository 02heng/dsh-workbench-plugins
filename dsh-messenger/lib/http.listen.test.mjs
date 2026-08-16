import { mkdir, rm } from "node:fs/promises"
import { createStore } from "./store.js"
import { registerDesk } from "./http.js"

const root = "D:/dsh-workbench/messenger/_test-http-listen"
await rm(root, { recursive: true, force: true })
await mkdir(root, { recursive: true })
const store = createStore(root)

const calls = []
const sidecar = {
	started: false,
	start() {
		this.started = true
		calls.push("start")
		return { ok: true, pid: 1 }
	},
	stop() {
		this.started = false
		calls.push("stop")
		return { ok: true }
	},
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

const origin = { host: "127.0.0.1:3080", origin: "http://127.0.0.1:3080" }
const stopDesk = registerDesk(webServer, { store, root, sidecar }, null)
try {
	const listenRoute = find("/plugins/dsh-messenger/wx/listen")
	const healthRoute = find("/plugins/dsh-messenger/wx/health")
	if (!listenRoute || !healthRoute) {
		console.error("FAIL routes", [...routes.keys()])
		process.exit(1)
	}

	const healthRemote = res()
	await healthRoute.handler(req({
		method: "POST",
		body: { ok: true },
		remoteAddress: "8.8.8.8",
	}), healthRemote)
	if (healthRemote.status !== 403) {
		console.error("FAIL health remote", healthRemote)
		process.exit(1)
	}

	const healthDown = res()
	await healthRoute.handler(req({
		method: "POST",
		body: { ok: false, error: "未登录" },
	}), healthDown)
	if (healthDown.status !== 200 || parsed(healthDown).ok !== false) {
		console.error("FAIL health down", healthDown)
		process.exit(1)
	}
	const afterDown = await store.loadConfig()
	if (afterDown.listen !== false || afterDown.listenError !== "未登录") {
		console.error("FAIL health wrote listen", afterDown)
		process.exit(1)
	}
	const stateDown = res()
	await find("/plugins/dsh-messenger/state").handler(req(), stateDown)
	if (stateDown.status !== 200 || parsed(stateDown).listenError !== "未登录") {
		console.error("FAIL state listenError", stateDown)
		process.exit(1)
	}

	const healthUp = res()
	await healthRoute.handler(req({ method: "POST", body: { ok: true } }), healthUp)
	if (healthUp.status !== 200 || parsed(healthUp).ok !== true) {
		console.error("FAIL health up", healthUp)
		process.exit(1)
	}
	const afterUp = await store.loadConfig()
	if (afterUp.listen !== true) {
		console.error("FAIL health up listen", afterUp)
		process.exit(1)
	}

	const listenCsrf = res()
	await listenRoute.handler(req({
		method: "POST",
		headers: { host: "127.0.0.1:3080", origin: "http://evil.example" },
		body: { on: true },
	}), listenCsrf)
	if (listenCsrf.status !== 403) {
		console.error("FAIL listen csrf", listenCsrf)
		process.exit(1)
	}

	const listenOn = res()
	await listenRoute.handler(req({
		method: "POST",
		headers: origin,
		body: { on: true },
	}), listenOn)
	if (listenOn.status !== 200 || parsed(listenOn).on !== true || !sidecar.started) {
		console.error("FAIL listen on", listenOn, sidecar.started)
		process.exit(1)
	}

	const listenOff = res()
	await listenRoute.handler(req({
		method: "POST",
		headers: origin,
		body: { on: false },
	}), listenOff)
	if (listenOff.status !== 200 || parsed(listenOff).on !== false || sidecar.started) {
		console.error("FAIL listen off", listenOff, sidecar.started)
		process.exit(1)
	}
	if (calls.join(",") !== "start,stop") {
		console.error("FAIL sidecar calls", calls)
		process.exit(1)
	}

	stopDesk?.()
	await rm(root, { recursive: true, force: true })
	console.log("PASS http-listen")
} finally {
	stopDesk?.()
}
