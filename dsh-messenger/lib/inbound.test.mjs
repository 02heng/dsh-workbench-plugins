import { mkdir, rm } from "node:fs/promises"
import { createStore } from "./store.js"
import { handleInbound } from "./dispatch.js"

const root = "D:/dsh-workbench/messenger/_test-inbound"
await rm(root, { recursive: true, force: true })
await mkdir(root, { recursive: true })
const store = createStore(root)

const saved = await handleInbound(store, { from: "黄山", text: "你好", kind: "text" }, null)
if (saved.error) {
	console.error("FAIL saved rejected", saved)
	process.exit(1)
}
const afterSave = await store.listItems()
if (afterSave.length !== 1 || afterSave[0].from !== "黄山" || afterSave[0].text !== "你好") {
	console.error("FAIL saved list", afterSave)
	process.exit(1)
}
if (!afterSave[0].id || !String(afterSave[0].id).startsWith("T-")) {
	console.error("FAIL saved id", afterSave[0])
	process.exit(1)
}
if (afterSave[0].status !== "recorded") {
	console.error("FAIL saved status", afterSave[0])
	process.exit(1)
}

try {
	await handleInbound(store, { from: "别人", text: "任务: x", kind: "text" }, null)
	console.error("FAIL should reject foreign sender")
	process.exit(1)
} catch (error) {
	if (!String(error.message).includes("只收黄山")) {
		console.error("FAIL message", error)
		process.exit(1)
	}
}
const afterReject = await store.listItems()
if (afterReject.length !== 1 || afterReject[0].text !== "你好") {
	console.error("FAIL list changed on reject", afterReject)
	process.exit(1)
}

const trimmed = await handleInbound(store, { from: "  黄山  ", text: "再记一条", kind: "text" }, null)
if (trimmed.status !== "recorded" || trimmed.from !== "黄山") {
	console.error("FAIL trim from", trimmed)
	process.exit(1)
}

const noApi = await handleInbound(store, { from: "黄山", text: "任务: 无代理", kind: "text" }, null)
if (noApi.status !== "dispatch-failed" || !String(noApi.error).includes("没有 apiProxy")) {
	console.error("FAIL no apiProxy", noApi)
	process.exit(1)
}

await rm(root, { recursive: true, force: true })
console.log("PASS inbound")
