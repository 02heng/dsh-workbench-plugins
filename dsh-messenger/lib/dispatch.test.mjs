import { mkdir, rm } from "node:fs/promises"
import { createStore } from "./store.js"
import { handleInbound } from "./dispatch.js"

const root = "D:/dsh-workbench/messenger/_test-dispatch"
await rm(root, { recursive: true, force: true })
await mkdir(root, { recursive: true })
const store = createStore(root)
const calls = []
const api = {
	sessions: {
		async create(req) {
			calls.push(["create", req.payload])
			return { ok: true, value: { sessionId: "sess-1", agentPreset: "work" } }
		},
		async prompt(req) {
			calls.push(["prompt", req.payload])
			return { ok: true, value: { accepted: true } }
		},
		async rename(req) {
			calls.push(["rename", req.payload])
			return { ok: true, value: { title: req.payload.title, seq: 1 } }
		},
	},
}

const hello = await handleInbound(store, { from: "黄山", text: "你好", kind: "text" }, api)
if (hello.status !== "recorded" || calls.length) {
	console.error("FAIL hello", hello, calls)
	process.exit(1)
}

const task = await handleInbound(store, { from: "黄山", text: "任务: 写一句今日值班备忘", kind: "text" }, api)
if (task.status !== "running" || task.prompt !== "写一句今日值班备忘") {
	console.error("FAIL task", task)
	process.exit(1)
}
if (!calls.some((c) => c[0] === "create" && c[1].agentPreset === "work")) {
	console.error("FAIL create", calls)
	process.exit(1)
}

try {
	await handleInbound(store, { from: "别人", text: "任务: x", kind: "text" }, api)
	console.error("FAIL should reject others")
	process.exit(1)
} catch (error) {
	if (!String(error.message).includes("黄山")) {
		console.error("FAIL message", error)
		process.exit(1)
	}
}

const boomApi = {
	sessions: {
		async create() { throw new Error("nope") },
		async prompt() {},
		async rename() {},
	},
}
const failed = await handleInbound(store, { from: "黄山", text: "任务: 再来", kind: "text" }, boomApi)
if (failed.status !== "dispatch-failed") {
	console.error("FAIL dispatch-failed", failed)
	process.exit(1)
}

const promptFailRoot = "D:/dsh-workbench/messenger/_test-dispatch-prompt-fail"
await rm(promptFailRoot, { recursive: true, force: true })
await mkdir(promptFailRoot, { recursive: true })
const promptFailStore = createStore(promptFailRoot)
const promptFailApi = {
	sessions: {
		async create() {
			return { ok: true, value: { sessionId: "sess-pf" } }
		},
		async prompt() {
			return { result: { ok: false, error: "prompt rejected" } }
		},
		async rename() {
			return { ok: true, value: { title: "x", seq: 1 } }
		},
	},
}
const promptFailed = await handleInbound(
	promptFailStore,
	{ from: "黄山", text: "任务: bad prompt", kind: "text" },
	promptFailApi,
)
if (promptFailed.status !== "dispatch-failed" || promptFailed.status === "running") {
	console.error("FAIL prompt ok false", promptFailed)
	process.exit(1)
}
await rm(promptFailRoot, { recursive: true, force: true })

const renameFailRoot = "D:/dsh-workbench/messenger/_test-dispatch-rename-fail"
await rm(renameFailRoot, { recursive: true, force: true })
await mkdir(renameFailRoot, { recursive: true })
const renameFailStore = createStore(renameFailRoot)
const renameFailApi = {
	sessions: {
		async create() {
			return { ok: true, value: { sessionId: "sess-rn" } }
		},
		async prompt() {
			return { ok: true, value: { accepted: true } }
		},
		async rename() {
			return { result: { ok: false, error: "rename rejected" } }
		},
	},
}
const renameKept = await handleInbound(
	renameFailStore,
	{ from: "黄山", text: "任务: keep session", kind: "text" },
	renameFailApi,
)
if (renameKept.status !== "running" || renameKept.sessionId !== "sess-rn") {
	console.error("FAIL rename keeps running session", renameKept)
	process.exit(1)
}
await rm(renameFailRoot, { recursive: true, force: true })

await rm(root, { recursive: true, force: true })
console.log("PASS dispatch")
