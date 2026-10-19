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
const promptCall = calls.find((c) => c[0] === "prompt")
if (!String(promptCall?.[1]?.content?.[0]?.text || "").includes("自动落成")) {
	console.error("FAIL weixin prompt must auto-materialize office files", promptCall)
	process.exit(1)
}
if (!calls.some((c) => c[0] === "create" && c[1].agentPreset === "work")) {
	console.error("FAIL create", calls)
	process.exit(1)
}
if (calls.some((c) => c[0] === "selectModel")) {
	console.error("FAIL default dispatch must not selectModel", calls)
	process.exit(1)
}

const modelRoot = "D:/dsh-workbench/messenger/_test-dispatch-model"
await rm(modelRoot, { recursive: true, force: true })
await mkdir(modelRoot, { recursive: true })
const modelStore = createStore(modelRoot)
await modelStore.saveConfig({
	contact: "黄山",
	replyProvider: "deepseek-official",
	replyModel: "deepseek-v4-flash",
	replyEffort: "high",
})
const modelCalls = []
const modelApi = {
	sessions: {
		async create(req) {
			modelCalls.push(["create", req.payload])
			return { ok: true, value: { sessionId: "sess-model", agentPreset: "work" } }
		},
		async selectModel(req) {
			modelCalls.push(["selectModel", req.payload])
			return { ok: true, value: { selected: req.payload } }
		},
		async prompt(req) {
			modelCalls.push(["prompt", req.payload])
			return { ok: true, value: { accepted: true } }
		},
		async rename(req) {
			modelCalls.push(["rename", req.payload])
			return { ok: true, value: { title: req.payload.title, seq: 1 } }
		},
	},
}
const modeled = await handleInbound(modelStore, { from: "黄山", text: "任务: 用选定模型", kind: "text" }, modelApi)
if (modeled.status !== "running") {
	console.error("FAIL modeled running", modeled)
	process.exit(1)
}
const selected = modelCalls.find((c) => c[0] === "selectModel")?.[1]
if (!selected || selected.sessionId !== "sess-model"
	|| selected.provider !== "deepseek-official"
	|| selected.model !== "deepseek-v4-flash"
	|| selected.reasoningEffort !== "high") {
	console.error("FAIL selectModel payload", modelCalls)
	process.exit(1)
}
const createIdx = modelCalls.findIndex((c) => c[0] === "create")
const selectIdx = modelCalls.findIndex((c) => c[0] === "selectModel")
const promptIdx = modelCalls.findIndex((c) => c[0] === "prompt")
if (!(createIdx < selectIdx && selectIdx < promptIdx)) {
	console.error("FAIL selectModel order", modelCalls.map((c) => c[0]))
	process.exit(1)
}
await rm(modelRoot, { recursive: true, force: true })

try {
	await handleInbound(store, { from: "别人", text: "任务: x", kind: "text" }, api)
	console.error("FAIL should reject others")
	process.exit(1)
} catch (error) {
	if (!String(error.message).includes("未登记")) {
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
