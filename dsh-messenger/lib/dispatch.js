import { join } from "node:path"
import { listDeliverables, workRoot } from "./deliverables.js"
import { enqueueOut } from "./outbox.js"
import { parseInbound } from "./password.js"
import { captureScreen } from "./shot.js"

const CWD = "D:/dsh-workbench"
const PRESET = "work"

function rpcId() {
	return `wx-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function unwrap(result) {
	if (result && typeof result === "object" && "result" in result && result.result) return result.result
	return result ?? {}
}

function rpcFailed(result) {
	const inner = unwrap(result)
	return inner.ok === false
}

function errorOf(result, fallback) {
	const inner = unwrap(result)
	return String(inner.error?.message ?? inner.error ?? fallback)
}

function sessionIdOf(result) {
	const inner = unwrap(result)
	return inner.value?.sessionId
}

export async function handleInbound(store, body, api) {
	const config = await store.loadConfig()
	const contact = config.contact ?? "黄山"
	const from = String(body?.from ?? "").trim()
	if (from !== contact) throw new Error("只收黄山")

	const kind = body.kind ?? "text"
	const text = body.text ?? ""
	const parsed = parseInbound(text, kind)
	const action = parsed.action

	if (action === "ignore") {
		return store.appendItem({
			id: await store.nextTaskId(),
			from,
			text,
			kind,
			action: "ignore",
			prompt: parsed.prompt,
			status: "recorded",
		})
	}

	if (action === "record" || action === "empty-password") {
		return store.appendItem({
			id: await store.nextTaskId(),
			from,
			text,
			kind,
			action,
			prompt: parsed.prompt,
			status: action === "empty-password" ? "empty-password" : "recorded",
		})
	}

	try {
		const { createCraftStore } = await import("../../dsh-craft/lib/store.js")
		await createCraftStore("D:/dsh-workbench/craft").setMode("craft", { channel: "weixin" })
	} catch { /* 派活台未装时不挡微信 */ }

	const id = await store.nextTaskId()
	const title = `微信·黄山·${id}`
	await store.appendItem({
		id,
		from,
		text,
		kind,
		action: "dispatch",
		prompt: parsed.prompt,
		status: "queued",
		title,
	})

	if (api == null) {
		return store.updateItem(id, { status: "dispatch-failed", error: "没有 apiProxy" })
	}

	try {
		const created = await api.sessions.create({
			rpcId: rpcId(),
			payload: { cwd: CWD, agentPreset: PRESET },
		})
		if (rpcFailed(created)) {
			return store.updateItem(id, { status: "dispatch-failed", error: errorOf(created, "create failed") })
		}
		const sessionId = sessionIdOf(created)
		if (!sessionId) {
			return store.updateItem(id, { status: "dispatch-failed", error: "create 未返回 sessionId" })
		}
		const prompted = await api.sessions.prompt({
			rpcId: rpcId(),
			payload: {
				sessionId,
				mode: "queue",
				content: [{ type: "text", text: parsed.prompt }],
			},
		})
		if (rpcFailed(prompted)) {
			return store.updateItem(id, { status: "dispatch-failed", error: errorOf(prompted, "prompt failed") })
		}
		const running = await store.updateItem(id, { status: "running", sessionId, title })
		const renamed = await api.sessions.rename({
			rpcId: rpcId(),
			payload: { sessionId, title },
		})
		if (rpcFailed(renamed)) {
			return store.updateItem(id, { warn: errorOf(renamed, "rename failed") })
		}
		return running
	} catch (error) {
		return store.updateItem(id, {
			status: "dispatch-failed",
			error: String(error?.message ?? error),
		})
	}
}

async function replyCompleted(store, item) {
	try {
		const dest = join(store.root, "shots", `${item.id}.png`)
		const shot = await captureScreen(dest)
		const since = Date.parse(item.at) || 0
		const files = item.files?.length
			? item.files
			: await listDeliverables(join(workRoot(), "docs"), since)
		for (const file of files) {
			await enqueueOut(store, {
				type: "file",
				to: "黄山",
				text: "",
				file,
				taskId: item.id,
			})
		}
		await enqueueOut(store, {
			type: "image",
			to: "黄山",
			text: `任务 ${item.id} 已完成`,
			file: shot.path,
			taskId: item.id,
		})
		return store.updateItem(item.id, { status: "replying", files })
	} catch {
		return store.updateItem(item.id, { status: "shot-failed" })
	}
}

export async function finishTurn(store, item, reason) {
	if (item.status === "replied" || item.status === "replying") return item
	if (reason === "completed") return replyCompleted(store, item)
	try {
		await enqueueOut(store, {
			type: "text",
			to: "黄山",
			text: `任务 ${item.id} 未完成：${reason}`,
			taskId: item.id,
		})
		return store.updateItem(item.id, { status: "failed" })
	} catch (error) {
		return store.updateItem(item.id, {
			status: "failed",
			error: String(error?.message ?? error),
		})
	}
}

export async function retryTask(store, body, api) {
	const id = String(body?.id ?? "").trim()
	const mode = body?.mode
	const items = await store.listItems()
	const item = items.find((row) => row.id === id)
	if (!item) throw new Error(`没有任务 ${id}`)
	if (mode === "dispatch") {
		return handleInbound(store, {
			from: item.from ?? "黄山",
			text: `任务: ${item.prompt ?? ""}`,
			kind: "text",
		}, api)
	}
	if (mode === "shot") {
		if (item.status !== "shot-failed" && item.status !== "replied" && item.status !== "replying") {
			throw new Error("只能对回图中、回图失败或已回图再截")
		}
		return replyCompleted(store, item)
	}
	throw new Error("mode 须为 dispatch 或 shot")
}

export async function defaultOnEnd(_item, _reason) {
	// watchTurns 由 index 传入 finishTurn
}

export function watchTurns(ctx, store, onEnd = defaultOnEnd) {
	return ctx.on("session/event", async (session, event) => {
		if (event?.type !== "turn/end") return
		const items = await store.listItems()
		const item = items.find((row) => row.sessionId === session?.id && row.status === "running")
		if (!item) return
		const reason = event.data?.reason?.kind ?? event.reason?.kind ?? "unknown"
		await onEnd(item, reason)
	}, { global: true })
}
