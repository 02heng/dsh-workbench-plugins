import { mkdir, rm } from "node:fs/promises"
import { createStore } from "./store.js"

const root = "D:/dsh-workbench/messenger/_test"
await rm(root, { recursive: true, force: true })
await mkdir(root, { recursive: true })
const store = createStore(root)

const a = await store.nextTaskId(new Date("2026-08-15T12:00:00+08:00"))
const b = await store.nextTaskId(new Date("2026-08-15T12:01:00+08:00"))
if (a !== "T-0815-01" || b !== "T-0815-02") {
	console.error("FAIL ids", a, b)
	process.exit(1)
}

const item = await store.appendItem({
	id: a, from: "黄山", text: "任务: 备忘", kind: "text",
	action: "dispatch", status: "queued", prompt: "备忘",
})
const listed = await store.listItems()
if (listed.length !== 1 || listed[0].id !== a) {
	console.error("FAIL list", listed)
	process.exit(1)
}
const updated = await store.updateItem(a, { status: "running", sessionId: "s1" })
if (updated.status !== "running" || updated.sessionId !== "s1") {
	console.error("FAIL update", updated)
	process.exit(1)
}

await store.appendItem({
	id: b, from: "黄山", text: "闲聊", kind: "text",
	action: "record", status: "recorded", prompt: "闲聊",
})
await store.deleteItem(a)
const afterDel = await store.listItems()
if (afterDel.length !== 1 || afterDel[0].id !== b) {
	console.error("FAIL delete remaining", afterDel)
	process.exit(1)
}
try {
	await store.deleteItem(a)
	console.error("FAIL delete missing should throw")
	process.exit(1)
} catch (error) {
	if (!String(error.message).includes("没有任务")) {
		console.error("FAIL delete message", error)
		process.exit(1)
	}
}

const raceRoot = "D:/dsh-workbench/messenger/_test-store-race"
await rm(raceRoot, { recursive: true, force: true })
await mkdir(raceRoot, { recursive: true })
const raceStore = createStore(raceRoot)
await raceStore.appendItem({
	id: "T-0815-01", from: "黄山", text: "A", kind: "text",
	action: "dispatch", status: "queued", prompt: "A",
})
await Promise.all([
	raceStore.updateItem("T-0815-01", { status: "running" }),
	raceStore.appendItem({
		id: "T-0815-02", from: "黄山", text: "B", kind: "text",
		action: "record", status: "recorded", prompt: "B",
	}),
])
const raced = await raceStore.listItems()
if (raced.length !== 2 || !raced.some((row) => row.id === "T-0815-01") || !raced.some((row) => row.id === "T-0815-02")) {
	console.error("FAIL race lost row", raced)
	process.exit(1)
}
await rm(raceRoot, { recursive: true, force: true })

const badRoot = "D:/dsh-workbench/messenger/_test-store-bad-json"
await rm(badRoot, { recursive: true, force: true })
await mkdir(badRoot, { recursive: true })
const badStore = createStore(badRoot)
await badStore.appendItem({
	id: "T-0815-01", from: "黄山", text: "ok", kind: "text",
	action: "record", status: "recorded", prompt: "ok",
})
const { appendFile } = await import("node:fs/promises")
const { join } = await import("node:path")
await appendFile(join(badRoot, "inbox.jsonl"), "{not-json\n")
await badStore.appendItem({
	id: "T-0815-02", from: "黄山", text: "ok2", kind: "text",
	action: "record", status: "recorded", prompt: "ok2",
})
const skipped = await badStore.listItems()
if (skipped.length !== 2 || skipped.some((row) => !row.id)) {
	console.error("FAIL skip bad json", skipped)
	process.exit(1)
}
await rm(badRoot, { recursive: true, force: true })

const { ledgerDay, isStaleLedgerItem, formatBeijingTime } = await import("./store.js")
if (formatBeijingTime("2026-08-16T04:54:38.000Z") !== "2026-08-16 12:54:38") {
	console.error("FAIL formatBeijingTime utc to beijing")
	process.exit(1)
}
if (formatBeijingTime("2026-08-16T00:10:00+08:00") !== "2026-08-16 00:10:00") {
	console.error("FAIL formatBeijingTime already beijing")
	process.exit(1)
}
if (formatBeijingTime("2026-08-15T12:00:00Z", { seconds: false }) !== "2026-08-15 20:00") {
	console.error("FAIL formatBeijingTime no seconds")
	process.exit(1)
}
if (ledgerDay(new Date("2026-08-16T01:00:00+08:00")) !== "2026-08-16") {
	console.error("FAIL ledgerDay shanghai")
	process.exit(1)
}
if (!isStaleLedgerItem({ at: "2026-08-15T23:00:00+08:00" }, new Date("2026-08-16T00:30:00+08:00"))) {
	console.error("FAIL stale yesterday")
	process.exit(1)
}
if (isStaleLedgerItem({ at: "2026-08-16T00:10:00+08:00" }, new Date("2026-08-16T22:00:00+08:00"))) {
	console.error("FAIL today not stale")
	process.exit(1)
}

const purgeRoot = "D:/dsh-workbench/messenger/_test-store-purge"
await rm(purgeRoot, { recursive: true, force: true })
await mkdir(purgeRoot, { recursive: true })
const { writeFile } = await import("node:fs/promises")
await writeFile(join(purgeRoot, "inbox.jsonl"), [
	JSON.stringify({ id: "T-0815-01", at: "2026-08-15T12:00:00+08:00", text: "旧", status: "recorded" }),
	JSON.stringify({ id: "T-0816-01", at: "2026-08-16T12:00:00+08:00", text: "新", status: "recorded" }),
].join("\n") + "\n", "utf8")
const purgeStore = createStore(purgeRoot)
const purged = await purgeStore.purgeStaleItems(new Date("2026-08-16T13:00:00+08:00"))
if (purged.purged !== 1 || purged.kept !== 1) {
	console.error("FAIL purge counts", purged)
	process.exit(1)
}
const afterPurge = await purgeStore.listItems()
if (afterPurge.length !== 1 || afterPurge[0].id !== "T-0816-01") {
	console.error("FAIL purge remaining", afterPurge)
	process.exit(1)
}
const again = await purgeStore.purgeStaleItems(new Date("2026-08-16T18:00:00+08:00"))
if (again.purged !== 0) {
	console.error("FAIL purge idempotent", again)
	process.exit(1)
}
await rm(purgeRoot, { recursive: true, force: true })

await rm(root, { recursive: true, force: true })
console.log("PASS store")
