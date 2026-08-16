import { mkdir, rm, stat, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { createStore } from "./store.js"
import { finishTurn, retryTask } from "./dispatch.js"
import { takeOutbox } from "./outbox.js"

const root = "D:/dsh-workbench/messenger/_test-finish"
await rm(root, { recursive: true, force: true })
await mkdir(root, { recursive: true })
process.env.DSH_WORK_ROOT = root
const store = createStore(root)

const done = await store.appendItem({
	id: "T-0815-01",
	from: "黄山",
	text: "任务: 备忘",
	kind: "text",
	action: "dispatch",
	prompt: "备忘",
	status: "running",
	sessionId: "sess-1",
})
const completed = await finishTurn(store, done, "completed")
if (completed.status !== "replying") {
	console.error("FAIL completed status", completed)
	process.exit(1)
}
const shotPath = join(root, "shots", "T-0815-01.png")
const shotInfo = await stat(shotPath)
if (shotInfo.size < 1000) {
	console.error("FAIL shot size", shotInfo.size)
	process.exit(1)
}
const outDone = await takeOutbox(store)
if (
	outDone.length !== 1
	|| outDone[0].type !== "image"
	|| outDone[0].to !== "黄山"
	|| outDone[0].text !== "任务 T-0815-01 已完成"
	|| outDone[0].file !== shotPath
	|| outDone[0].taskId !== "T-0815-01"
	|| outDone[0].status !== "taken"
) {
	console.error("FAIL completed outbox", outDone)
	process.exit(1)
}

await mkdir(join(root, "docs", "方案"), { recursive: true })
const withFiles = await store.appendItem({
	id: "T-0815-06",
	from: "黄山",
	text: "任务: 方案",
	kind: "text",
	action: "dispatch",
	prompt: "方案",
	status: "running",
	sessionId: "sess-files",
})
await writeFile(join(root, "docs", "方案", "调研.docx"), "docx-bytes")
const filed = await finishTurn(store, withFiles, "completed")
if (filed.status !== "replying" || !filed.files?.some((p) => p.endsWith("调研.docx"))) {
	console.error("FAIL files status", filed)
	process.exit(1)
}
const outFiles = await takeOutbox(store)
if (
	outFiles.length !== 2
	|| outFiles[0].type !== "file"
	|| !String(outFiles[0].file).endsWith("调研.docx")
	|| outFiles[1].type !== "image"
	|| outFiles[1].text !== "任务 T-0815-06 已完成"
) {
	console.error("FAIL files outbox", outFiles)
	process.exit(1)
}

const again = await finishTurn(store, { ...completed, status: "replying" }, "completed")
if (again.status !== "replying") {
	console.error("FAIL replying guard status", again)
	process.exit(1)
}
const noMore = await takeOutbox(store)
if (noMore.length !== 0) {
	console.error("FAIL replied requeue", noMore)
	process.exit(1)
}

const boom = await store.appendItem({
	id: "T-0815-02",
	from: "黄山",
	text: "任务: 再来",
	kind: "text",
	action: "dispatch",
	prompt: "再来",
	status: "running",
	sessionId: "sess-2",
})
await rm(join(root, "outbox.jsonl"), { force: true })
await mkdir(join(root, "outbox.jsonl"), { recursive: true })
const shotFailed = await finishTurn(store, boom, "completed")
if (shotFailed.status !== "shot-failed" || shotFailed.status === "replied") {
	console.error("FAIL shot-failed", shotFailed)
	process.exit(1)
}
await rm(join(root, "outbox.jsonl"), { recursive: true, force: true })

const other = await store.appendItem({
	id: "T-0815-03",
	from: "黄山",
	text: "任务: 失败",
	kind: "text",
	action: "dispatch",
	prompt: "失败",
	status: "running",
	sessionId: "sess-3",
})
const failed = await finishTurn(store, other, "error")
if (failed.status !== "failed") {
	console.error("FAIL other status", failed)
	process.exit(1)
}
const outFail = await takeOutbox(store)
if (
	outFail.length !== 1
	|| outFail[0].type !== "text"
	|| outFail[0].to !== "黄山"
	|| outFail[0].text !== "任务 T-0815-03 未完成：error"
	|| outFail[0].taskId !== "T-0815-03"
) {
	console.error("FAIL other outbox", outFail)
	process.exit(1)
}

const retryRoot = "D:/dsh-workbench/messenger/_test-retry"
await rm(retryRoot, { recursive: true, force: true })
await mkdir(retryRoot, { recursive: true })
process.env.DSH_WORK_ROOT = retryRoot
const retryStore = createStore(retryRoot)
await retryStore.appendItem({
	id: "T-0815-01",
	from: "黄山",
	text: "任务: 写一句今日值班备忘",
	kind: "text",
	action: "dispatch",
	prompt: "写一句今日值班备忘",
	status: "dispatch-failed",
	error: "nope",
})
const calls = []
const api = {
	sessions: {
		async create(req) {
			calls.push(["create", req.payload])
			return { ok: true, value: { sessionId: "sess-retry" } }
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
const redispatched = await retryTask(retryStore, { id: "T-0815-01", mode: "dispatch" }, api)
if (redispatched.id === "T-0815-01" || redispatched.status !== "running" || redispatched.prompt !== "写一句今日值班备忘") {
	console.error("FAIL retry dispatch", redispatched)
	process.exit(1)
}

await retryStore.appendItem({
	id: "T-0815-03",
	from: "黄山",
	prompt: "备忘",
	status: "running",
	sessionId: "sess-no",
})
await retryStore.appendItem({
	id: "T-0815-05",
	from: "黄山",
	prompt: "卡在回图中",
	status: "replying",
	sessionId: "sess-replying",
})
const retryReplying = await retryTask(retryStore, { id: "T-0815-05", mode: "shot" }, api)
if (retryReplying.status !== "replying") {
	console.error("FAIL retry shot from replying", retryReplying)
	process.exit(1)
}
const replyOut = await takeOutbox(retryStore)
if (replyOut.length !== 1 || replyOut[0].taskId !== "T-0815-05") {
	console.error("FAIL retry shot from replying outbox", replyOut)
	process.exit(1)
}
try {
	await retryTask(retryStore, { id: "T-0815-03", mode: "shot" }, api)
	console.error("FAIL shot retry should reject running")
	process.exit(1)
} catch (error) {
	if (!String(error.message).includes("再截")) {
		console.error("FAIL shot retry message", error)
		process.exit(1)
	}
}

await retryStore.updateItem("T-0815-03", { status: "shot-failed" })
const reshots = await retryTask(retryStore, { id: "T-0815-03", mode: "shot" }, api)
if (reshots.status !== "replying") {
	console.error("FAIL retry shot", reshots)
	process.exit(1)
}
const retryOut = await takeOutbox(retryStore)
if (retryOut.length !== 1 || retryOut[0].type !== "image" || retryOut[0].taskId !== "T-0815-03") {
	console.error("FAIL retry shot outbox", retryOut)
	process.exit(1)
}

const stuckRoot = "D:/dsh-workbench/messenger/_test-finish-enqueue-fail"
await rm(stuckRoot, { recursive: true, force: true })
await mkdir(stuckRoot, { recursive: true })
const stuckStore = createStore(stuckRoot)
const stuck = await stuckStore.appendItem({
	id: "T-0815-04",
	from: "黄山",
	text: "任务: 失败入队",
	kind: "text",
	action: "dispatch",
	prompt: "失败入队",
	status: "running",
	sessionId: "sess-4",
})
await mkdir(join(stuckRoot, "outbox.jsonl"), { recursive: true })
const stuckDone = await finishTurn(stuckStore, stuck, "error")
if (stuckDone.status !== "failed" || stuckDone.status === "running") {
	console.error("FAIL enqueue-fail stays failed", stuckDone)
	process.exit(1)
}
await rm(stuckRoot, { recursive: true, force: true })

await rm(root, { recursive: true, force: true })
await rm(retryRoot, { recursive: true, force: true })
console.log("PASS finishTurn")
