import { readFile } from "node:fs/promises"
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { createLive, loadFresh } from "../../dsh-work-ui/live.js"
import { createCraftStore, mergeTaskCards, searchRoots } from "./store.js"

const here = dirname(fileURLToPath(import.meta.url))
const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"])

function json(res, status, body) {
	res.writeHead(status, { "content-type": "application/json; charset=utf-8" })
	res.end(JSON.stringify(body))
}

function sameOrigin(req) {
	const host = String(req.headers.host ?? "")
	const origin = String(req.headers.origin ?? "")
	const referer = String(req.headers.referer ?? "")
	const check = (value) => {
		if (!value) return false
		try { return new URL(value).host === host } catch { return false }
	}
	if (origin) return check(origin)
	if (referer) return check(referer)
	return Boolean(host)
}

function isLoopback(req) {
	return LOOPBACK.has(String(req.socket?.remoteAddress ?? ""))
}

async function readBody(req) {
	const chunks = []
	for await (const chunk of req) chunks.push(chunk)
	if (chunks.length === 0) return {}
	return JSON.parse(Buffer.concat(chunks).toString("utf8"))
}

function guard(req, res) {
	if (!isLoopback(req) || !sameOrigin(req)) {
		json(res, 403, { error: "只接受本机同页请求" })
		return false
	}
	return true
}

async function messengerItems(messengerRoot) {
	try {
		const { createStore } = await import("../../dsh-messenger/lib/store.js")
		return await createStore(messengerRoot).listItems()
	} catch {
		return []
	}
}

async function parsedDocs(docsRoot) {
	try {
		const { loadIndex } = await import("../../dsh-office/lib/inbox.js")
		const index = await loadIndex(docsRoot)
		return (index.docs ?? []).slice(0, 40).map((doc) => ({
			id: doc.id,
			name: doc.name,
			title: String(doc.name || "").replace(/\.[^.]+$/, ""),
			path: doc.parsed || doc.kbPath || doc.original,
		}))
	} catch {
		return []
	}
}

export async function deskState(store, config) {
	const snap = await store.snapshot()
	const items = await messengerItems(config.messengerRoot ?? "D:/dsh-workbench/messenger")
	const docs = await parsedDocs(config.docsRoot ?? "D:/dsh-workbench/docs")
	return {
		...snap,
		cards: mergeTaskCards(items, snap.tasks),
		docs,
		hits: snap.hits ?? [],
	}
}

export function registerCraft(webServer, config = {}) {
	const store = config.store ?? createCraftStore(config.root ?? "D:/dsh-workbench/craft")
	const searchDirs = config.searchRoots ?? ["D:/dsh-kb", "D:/dsh-workbench/docs/parsed"]
	const live = createLive({ dirs: [here], path: "/plugins/dsh-craft/live" })
	const stops = [live.register(webServer)]

	const post = (path, fn) => webServer.register({
		kind: "exact",
		path,
		handler: async (req, res) => {
			if (req.method !== "POST") return json(res, 405, { error: "要用 POST" })
			if (!guard(req, res)) return
			try { json(res, 200, await fn(await readBody(req))) }
			catch (error) { json(res, 400, { error: String(error?.message ?? error) }) }
		},
	})

	stops.push(webServer.register({
		kind: "exact",
		path: "/plugins/dsh-craft/desk",
		handler: async (_req, res) => {
			try {
				const { deskHtml } = await loadFresh(new URL("./desk.js", import.meta.url).href)
				const html = live.withLive(deskHtml(await deskState(store, config)))
				res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" })
				res.end(html)
			} catch (error) {
				res.writeHead(500, { "content-type": "text/plain; charset=utf-8" })
				res.end(String(error?.message ?? error))
			}
		},
	}))
	stops.push(webServer.register({
		kind: "exact",
		path: "/plugins/dsh-craft/api/state",
		handler: async (_req, res) => {
			try { json(res, 200, await store.snapshot()) }
			catch (error) { json(res, 500, { error: String(error?.message ?? error) }) }
		},
	}))
	stops.push(post("/plugins/dsh-craft/api/mode", (body) => store.setMode(body.mode, { channel: body.channel })))
	stops.push(post("/plugins/dsh-craft/api/expert", (body) => store.setExpert(body.expert)))
	stops.push(post("/plugins/dsh-craft/api/goal", (body) => store.add(body.title)))
	stops.push(post("/plugins/dsh-craft/api/goal-done", (body) => store.done(body.id)))
	stops.push(post("/plugins/dsh-craft/api/options", (body) => store.putOptions(body.brief, body.options)))
	stops.push(post("/plugins/dsh-craft/api/pick", (body) => store.chooseOption(body.index)))
	stops.push(post("/plugins/dsh-craft/api/patch", (body) => store.queuePatch(body)))
	stops.push(post("/plugins/dsh-craft/api/apply", (body) => store.applyPatch(body.replacement)))
	stops.push(post("/plugins/dsh-craft/api/review", (body) => store.addReview(body.path, body.notes)))
	stops.push(post("/plugins/dsh-craft/api/files", (body) => store.bindFiles(body.id, body.files)))
	stops.push(post("/plugins/dsh-craft/api/search", async (body) => ({ hits: await searchRoots(searchDirs, body.query, body.limit) })))
	stops.push(post("/plugins/dsh-craft/api/doc", async (body) => {
		const path = String(body.path ?? "")
		if (!/^[dD]:[\\/]/.test(path)) throw new Error("只读 D 盘")
		return { path, body: await readFile(path, "utf8") }
	}))
	return () => { for (const stop of stops) stop?.() }
}
