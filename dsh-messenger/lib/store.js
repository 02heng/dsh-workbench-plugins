import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises"
import { join } from "node:path"

function createQueue() {
	let chain = Promise.resolve()
	return (fn) => {
		const run = chain.then(() => fn(), () => fn())
		chain = run.then(() => {}, () => {})
		return run
	}
}

export function ledgerDay(value = new Date()) {
	const date = value instanceof Date ? value : new Date(value)
	if (Number.isNaN(date.getTime())) return ""
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: "Asia/Shanghai",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(date)
	const year = parts.find((part) => part.type === "year")?.value
	const month = parts.find((part) => part.type === "month")?.value
	const day = parts.find((part) => part.type === "day")?.value
	return year && month && day ? `${year}-${month}-${day}` : ""
}

export function formatBeijingTime(value, { seconds = true } = {}) {
	const date = value instanceof Date ? value : new Date(value)
	if (Number.isNaN(date.getTime())) return ""
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: "Asia/Shanghai",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hourCycle: "h23",
	}).formatToParts(date)
	const get = (type) => parts.find((part) => part.type === type)?.value ?? ""
	const clock = seconds
		? `${get("hour")}:${get("minute")}:${get("second")}`
		: `${get("hour")}:${get("minute")}`
	return `${get("year")}-${get("month")}-${get("day")} ${clock}`
}

export function isStaleLedgerItem(item, now = new Date()) {
	const day = ledgerDay(item?.at)
	return Boolean(day) && day < ledgerDay(now)
}

function parseJsonl(text) {
	const rows = []
	for (const line of text.split(/\r?\n/).filter(Boolean)) {
		try { rows.push(JSON.parse(line)) } catch { /* skip broken line */ }
	}
	return rows
}

export function createStore(root = "D:/dsh-workbench/messenger") {
	const inbox = join(root, "inbox.jsonl")
	const configPath = join(root, "config.json")
	const issuedSeq = new Map()
	const run = createQueue()

	async function ensure() {
		await mkdir(join(root, "shots"), { recursive: true })
		await mkdir(join(root, "drafts"), { recursive: true })
	}

	async function readItems() {
		await ensure()
		let text = ""
		try { text = await readFile(inbox, "utf8") } catch { return [] }
		return parseJsonl(text)
	}

	async function listItems() {
		return run(readItems)
	}

	function stamp(now) {
		const parts = new Intl.DateTimeFormat("en-GB", {
			timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit",
		}).formatToParts(now)
		const mm = parts.find((p) => p.type === "month").value
		const dd = parts.find((p) => p.type === "day").value
		return `${mm}${dd}`
	}

	async function nextTaskId(now = new Date()) {
		const day = stamp(now)
		const prefix = `T-${day}-`
		const items = await listItems()
		let max = issuedSeq.get(prefix) ?? 0
		for (const item of items) {
			if (!String(item.id ?? "").startsWith(prefix)) continue
			const n = Number(String(item.id).slice(prefix.length))
			if (Number.isFinite(n)) max = Math.max(max, n)
		}
		const next = max + 1
		issuedSeq.set(prefix, next)
		return `${prefix}${String(next).padStart(2, "0")}`
	}

	async function appendItem(item) {
		return run(async () => {
			await ensure()
			const row = { at: new Date().toISOString(), ...item }
			await appendFile(inbox, `${JSON.stringify(row)}\n`, "utf8")
			return row
		})
	}

	async function updateItem(id, patch) {
		return run(async () => {
			const items = await readItems()
			const next = items.map((row) => row.id === id ? { ...row, ...patch } : row)
			const hit = next.find((row) => row.id === id)
			if (!hit) throw new Error(`没有任务 ${id}`)
			await writeFile(inbox, next.map((row) => JSON.stringify(row)).join("\n") + (next.length ? "\n" : ""), "utf8")
			return hit
		})
	}

	async function purgeStaleItems(now = new Date()) {
		return run(async () => {
			const items = await readItems()
			const next = items.filter((row) => !isStaleLedgerItem(row, now))
			if (next.length === items.length) return { purged: 0, kept: items.length }
			await writeFile(inbox, next.map((row) => JSON.stringify(row)).join("\n") + (next.length ? "\n" : ""), "utf8")
			return { purged: items.length - next.length, kept: next.length }
		})
	}

	async function deleteItem(id) {
		return run(async () => {
			const items = await readItems()
			const next = items.filter((row) => row.id !== id)
			if (next.length === items.length) throw new Error("没有任务")
			await writeFile(inbox, next.map((row) => JSON.stringify(row)).join("\n") + (next.length ? "\n" : ""), "utf8")
			return { ok: true, id }
		})
	}

	async function loadConfig() {
		await ensure()
		try { return JSON.parse(await readFile(configPath, "utf8")) } catch {
			return { contact: "黄山", password: "任务:", mailbox: "", listen: true }
		}
	}

	async function saveConfig(patch) {
		const cur = await loadConfig()
		const next = { ...cur, ...patch }
		await writeFile(configPath, JSON.stringify(next, null, 2), "utf8")
		return next
	}

	return { root, nextTaskId, appendItem, listItems, updateItem, deleteItem, purgeStaleItems, loadConfig, saveConfig }
}
