import { mkdir, rm } from "node:fs/promises"
import { createStore } from "./store.js"
import { enqueueOut, takeOutbox, ackOut } from "./outbox.js"

const root = "D:/dsh-workbench/messenger/_test-outbox"
await rm(root, { recursive: true, force: true })
await mkdir(root, { recursive: true })
const store = createStore(root)

const job = await enqueueOut(store, {
	type: "image",
	to: "黄山",
	text: "任务 T-0815-01 已完成",
	file: "D:/dsh-workbench/messenger/_test-outbox/shots/T-0815-01.png",
	taskId: "T-0815-01",
})
if (!job.id || job.status !== "pending" || job.type !== "image" || job.to !== "黄山" || job.taskId !== "T-0815-01") {
	console.error("FAIL enqueue", job)
	process.exit(1)
}

const taken = await takeOutbox(store)
if (taken.length !== 1 || taken[0].id !== job.id || taken[0].status !== "taken") {
	console.error("FAIL take", taken)
	process.exit(1)
}

const empty = await takeOutbox(store)
if (empty.length !== 0) {
	console.error("FAIL take twice", empty)
	process.exit(1)
}

const sent = await ackOut(store, job.id, true)
if (sent.status !== "sent" || sent.id !== job.id) {
	console.error("FAIL ack ok", sent)
	process.exit(1)
}

const failJob = await enqueueOut(store, {
	type: "text",
	to: "黄山",
	text: "任务 T-0815-02 未完成：unknown",
	taskId: "T-0815-02",
})
const takenFail = await takeOutbox(store)
if (takenFail.length !== 1 || takenFail[0].id !== failJob.id) {
	console.error("FAIL take fail job", takenFail)
	process.exit(1)
}
const erred = await ackOut(store, failJob.id, false, "wx send failed")
if (erred.status !== "error" || erred.error !== "wx send failed") {
	console.error("FAIL ack error", erred)
	process.exit(1)
}

try {
	await ackOut(store, "missing-id", true)
	console.error("FAIL ack missing should throw")
	process.exit(1)
} catch (error) {
	if (!String(error.message).includes("missing-id")) {
		console.error("FAIL ack missing message", error)
		process.exit(1)
	}
}

const inboxRoot = "D:/dsh-workbench/messenger/_test-outbox-inbox"
await rm(inboxRoot, { recursive: true, force: true })
await mkdir(inboxRoot, { recursive: true })
const inboxStore = createStore(inboxRoot)
await inboxStore.appendItem({
	id: "T-0815-09", from: "黄山", text: "任务: 图", kind: "text",
	action: "dispatch", status: "replying", prompt: "图",
	error: "SetForegroundWindow",
})
const imgJob = await enqueueOut(inboxStore, {
	type: "image", to: "黄山", text: "任务 T-0815-09 已完成",
	file: "x.png", taskId: "T-0815-09",
})
await takeOutbox(inboxStore)
const sentInbox = await ackOut(inboxStore, imgJob.id, true)
if (sentInbox.status !== "sent") {
	console.error("FAIL ack inbox ok outbox", sentInbox)
	process.exit(1)
}
const afterOk = (await inboxStore.listItems()).find((row) => row.id === "T-0815-09")
if (afterOk.status !== "replied" || afterOk.error) {
	console.error("FAIL ack inbox ok status", afterOk)
	process.exit(1)
}

await inboxStore.appendItem({
	id: "T-0815-10", from: "黄山", text: "任务: 图2", kind: "text",
	action: "dispatch", status: "replying", prompt: "图2",
})
const imgFail = await enqueueOut(inboxStore, {
	type: "image", to: "黄山", text: "任务 T-0815-10 已完成",
	file: "y.png", taskId: "T-0815-10",
})
await takeOutbox(inboxStore)
await ackOut(inboxStore, imgFail.id, false, "SendFiles 失败")
const afterFail = (await inboxStore.listItems()).find((row) => row.id === "T-0815-10")
if (afterFail.status !== "shot-failed") {
	console.error("FAIL ack inbox fail status", afterFail)
	process.exit(1)
}
await rm(inboxRoot, { recursive: true, force: true })

await rm(root, { recursive: true, force: true })
console.log("PASS outbox")
