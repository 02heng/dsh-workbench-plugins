import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises"
import { join } from "node:path"
import { formatBeijingTime, ledgerDay } from "../../dsh-work-ui/time.js"
import { activeLine, newId, normalizeLines } from "./lines.js"

export { formatBeijingTime, ledgerDay }

function createQueue() {
	let chain = Promise.resolve()
	return (fn) => {
		const run = chain.then(() => fn(), () => fn())
		chain = run.then(() => {}, () => {})
		return run
	}
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
		try {
			return normalizeLines(JSON.parse(await readFile(configPath, "utf8")))
		} catch {
			return normalizeLines({ mailbox: "", listen: true })
		}
	}

	async function saveConfig(patch) {
		const cur = await loadConfig()
		const next = normalizeLines({ ...cur, ...patch })
		await writeFile(configPath, JSON.stringify(next, null, 2), "utf8")
		return next
	}

	async function upsertLine(body) {
		const cfg = await loadConfig()
		const name = String(body?.name ?? "").trim()
		if (!name) throw new Error("请填写微信备注")
		if (cfg.lines.some((line) => line.name === name && line.id !== body?.id)) {
			throw new Error("名册里已有这个备注")
		}
		const id = String(body?.id ?? "").trim()
		const existing = cfg.lines.find((line) => line.id === id)
		const line = {
			id: existing?.id || newId("line"),
			name,
			passwords: Array.isArray(body?.passwords) && body.passwords.length
				? body.passwords
				: (existing?.passwords ?? [{ id: newId("pw"), token: "任务:", prompt: "{{input}}" }]),
		}
		const lines = existing
			? cfg.lines.map((row) => row.id === line.id ? { ...row, ...line } : row)
			: [...cfg.lines, line]
		return saveConfig({ lines, activeLineId: line.id })
	}

	async function selectLine(id) {
		const cfg = await loadConfig()
		if (!cfg.lines.some((line) => line.id === id)) throw new Error("没有这条专线")
		return saveConfig({ activeLineId: id })
	}

	async function deleteLine(id) {
		const cfg = await loadConfig()
		if (cfg.lines.length <= 1) throw new Error("至少留一条专线")
		const lines = cfg.lines.filter((line) => line.id !== id)
		if (lines.length === cfg.lines.length) throw new Error("没有这条专线")
		const activeLineId = cfg.activeLineId === id ? lines[0].id : cfg.activeLineId
		return saveConfig({ lines, activeLineId })
	}

	async function upsertPassword(lineId, body) {
		const cfg = await loadConfig()
		const line = cfg.lines.find((row) => row.id === lineId)
		if (!line) throw new Error("没有这条专线")
		const token = String(body?.token ?? "").trim()
		if (!token) throw new Error("请填写口令")
		const id = String(body?.id ?? "").trim()
		if (line.passwords.some((row) => row.token === token && row.id !== id)) {
			throw new Error("这条专线已有相同口令")
		}
		const password = {
			id: line.passwords.find((row) => row.id === id)?.id || newId("pw"),
			token,
			prompt: String(body?.prompt ?? "{{input}}"),
		}
		const passwords = line.passwords.some((row) => row.id === password.id)
			? line.passwords.map((row) => row.id === password.id ? password : row)
			: [...line.passwords, password]
		const lines = cfg.lines.map((row) => row.id === lineId ? { ...row, passwords } : row)
		return saveConfig({ lines, activeLineId: lineId })
	}

	async function deletePassword(lineId, passwordId) {
		const cfg = await loadConfig()
		const line = cfg.lines.find((row) => row.id === lineId)
		if (!line) throw new Error("没有这条专线")
		if (line.passwords.length <= 1) throw new Error("至少留一条口令")
		const passwords = line.passwords.filter((row) => row.id !== passwordId)
		if (passwords.length === line.passwords.length) throw new Error("没有这条口令")
		const lines = cfg.lines.map((row) => row.id === lineId ? { ...row, passwords } : row)
		return saveConfig({ lines })
	}

	return {
		root, nextTaskId, appendItem, listItems, updateItem, deleteItem, purgeStaleItems,
		loadConfig, saveConfig, upsertLine, selectLine, deleteLine, upsertPassword, deletePassword,
		activeLine: async () => activeLine(await loadConfig()),
	}
}
