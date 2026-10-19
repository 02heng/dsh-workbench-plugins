import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises"
import { join } from "node:path"

const queues = new WeakMap()

function queueOf(store) {
	let run = queues.get(store)
	if (!run) {
		let chain = Promise.resolve()
		run = (fn) => {
			const next = chain.then(() => fn(), () => fn())
			chain = next.then(() => {}, () => {})
			return next
		}
		queues.set(store, run)
	}
	return run
}

function parseJsonl(text) {
	const rows = []
	for (const line of text.split(/\r?\n/).filter(Boolean)) {
		try { rows.push(JSON.parse(line)) } catch { /* skip broken line */ }
	}
	return rows
}

function outboxPath(store) {
	return join(store.root, "outbox.jsonl")
}

async function ensure(store) {
	await mkdir(store.root, { recursive: true })
}

async function listOut(store) {
	await ensure(store)
	let text = ""
	try { text = await readFile(outboxPath(store), "utf8") } catch { return [] }
	return parseJsonl(text)
}

async function writeOut(store, rows) {
	await ensure(store)
	const body = rows.map((row) => JSON.stringify(row)).join("\n")
	await writeFile(outboxPath(store), body + (rows.length ? "\n" : ""), "utf8")
}

function nextOutId() {
	return `out-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export async function enqueueOut(store, job) {
	return queueOf(store)(async () => {
		const row = {
			id: job.id ?? nextOutId(),
			type: job.type,
			to: job.to,
			text: job.text,
			file: job.file,
			taskId: job.taskId,
			status: "pending",
		}
		await ensure(store)
		await appendFile(outboxPath(store), `${JSON.stringify(row)}\n`, "utf8")
		return row
	})
}

export async function takeOutbox(store) {
	return queueOf(store)(async () => {
		const rows = await listOut(store)
		const taken = []
		let grabbed = false
		const next = rows.map((row) => {
			if (grabbed || row.status !== "pending") return row
			grabbed = true
			const updated = { ...row, status: "taken" }
			taken.push(updated)
			return updated
		})
		if (taken.length) await writeOut(store, next)
		return taken
	})
}

async function markInbox(store, job, ok, error) {
	if (!job?.taskId || typeof store.updateItem !== "function") return
	try {
		if (ok) {
			if (job.type === "image") await store.updateItem(job.taskId, { status: "replied", error: "" })
			return
		}
		if (job.type === "image") {
			await store.updateItem(job.taskId, { status: "shot-failed", error })
			return
		}
		if (job.type === "file") {
			await store.updateItem(job.taskId, { error })
			return
		}
		await store.updateItem(job.taskId, { status: "failed", error })
	} catch {
		// 任务已删时仍以 outbox ack 为准
	}
}

export async function ackOut(store, id, ok, error) {
	const hit = await queueOf(store)(async () => {
		const rows = await listOut(store)
		let found
		const next = rows.map((row) => {
			if (row.id !== id) return row
			found = ok
				? { ...row, status: "sent" }
				: { ...row, status: "error", error }
			return found
		})
		if (!found) throw new Error(`没有回执 ${id}`)
		await writeOut(store, next)
		return found
	})
	await markInbox(store, hit, ok, error)
	return hit
}
