import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { createLive, loadFresh } from "../../dsh-work-ui/live.js"
import { loadInventory, saveInventory, upsertDevice, dutyStatus } from "./store.js"
import { loadTags, upsertTag } from "./tags.js"
import { deleteTask, listCheckins, loadTasks, manualCheckin, runDueTasks, upsertTask } from "./tasks.js"

const here = dirname(fileURLToPath(import.meta.url))

function json(res, status, body) {
	res.writeHead(status, { "content-type": "application/json; charset=utf-8" })
	res.end(JSON.stringify(body))
}

function sameOrigin(req) {
	const host = String(req.headers.host ?? "")
	const origin = String(req.headers.origin ?? "")
	if (!origin) return false
	try { return new URL(origin).host === host } catch { return false }
}

async function readBody(req) {
	const chunks = []
	for await (const chunk of req) chunks.push(chunk)
	if (chunks.length === 0) return {}
	return JSON.parse(Buffer.concat(chunks).toString("utf8"))
}

async function state(root) {
	const [inv, tags, tasks, checkins] = await Promise.all([
		loadInventory(root),
		loadTags(root),
		loadTasks(root),
		listCheckins(root, 20),
	])
	return {
		duty: dutyStatus(inv),
		devices: inv.devices,
		tags: tags.tags,
		tasks: tasks.tasks,
		checkins,
		board: "/plugins/dsh-datacenter/board",
	}
}

export function registerBoard(webServer, root) {
	const stops = []
	const live = createLive({
		dirs: [here],
		path: "/plugins/dsh-datacenter/live",
	})
	stops.push(live.register(webServer))
	stops.push(webServer.register({
		kind: "exact",
		path: "/plugins/dsh-datacenter/board",
		handler: async (_req, res) => {
			try {
				const { boardHtml } = await loadFresh(new URL("./board.js", import.meta.url).href)
				const html = live.withLive(boardHtml(await state(root)))
				res.writeHead(200, {
					"content-type": "text/html; charset=utf-8",
					"cache-control": "no-store",
				})
				res.end(html)
			} catch (error) {
				res.writeHead(500, { "content-type": "text/plain; charset=utf-8" })
				res.end(String(error?.message ?? error))
			}
		},
	}))
	stops.push(webServer.register({
		kind: "exact",
		path: "/plugins/dsh-datacenter/api/state",
		handler: async (_req, res) => {
			try { json(res, 200, await state(root)) }
			catch (error) { json(res, 500, { error: String(error?.message ?? error) }) }
		},
	}))
	const write = (path, fn) => {
		stops.push(webServer.register({
			kind: "exact",
			path,
			handler: async (req, res) => {
				try {
					if ((req.method ?? "GET") !== "POST") return json(res, 405, { error: "POST only" })
					if (!sameOrigin(req)) return json(res, 403, { error: "forbidden" })
					json(res, 200, await fn(await readBody(req)))
				} catch (error) {
					json(res, 400, { error: String(error?.message ?? error) })
				}
			},
		}))
	}
	write("/plugins/dsh-datacenter/api/tag", (body) => upsertTag(root, body))
	write("/plugins/dsh-datacenter/api/task", (body) => upsertTask(root, body))
	write("/plugins/dsh-datacenter/api/task/delete", (body) => deleteTask(root, body.id))
	write("/plugins/dsh-datacenter/api/checkin", (body) => manualCheckin(root, body.note ?? ""))
	write("/plugins/dsh-datacenter/api/device-tags", async (body) => {
		const inv = await loadInventory(root)
		const next = await saveInventory(root, upsertDevice(inv, { id: body.id, tags: body.tags }))
		return { device: next.devices.find((item) => item.id === body.id) }
	})
	write("/plugins/dsh-datacenter/api/run-due", () => runDueTasks(root))
	return () => { for (const stop of stops) stop() }
}
