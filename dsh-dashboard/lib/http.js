import { readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { createLive, loadFresh } from "../../dsh-work-ui/live.js"
import { dashboardState } from "./state.js"

const here = dirname(fileURLToPath(import.meta.url))
const vendor = join(here, "..", "vendor")

function sendFile(res, file, type) {
	return readFile(file).then((buf) => {
		res.writeHead(200, { "content-type": type, "cache-control": "no-store" })
		res.end(buf)
	}).catch(() => {
		res.writeHead(404, { "content-type": "text/plain; charset=utf-8" })
		res.end("missing")
	})
}

function json(res, status, body) {
	res.writeHead(status, { "content-type": "application/json; charset=utf-8" })
	res.end(JSON.stringify(body))
}

export function registerWall(webServer, config) {
	const stops = []
	const live = createLive({
		dirs: [here],
		path: "/plugins/dsh-dashboard/live",
	})
	stops.push(live.register(webServer))
	stops.push(webServer.register({
		kind: "exact",
		path: "/plugins/dsh-dashboard/wall",
		handler: async (_req, res) => {
			try {
				const { wallHtml } = await loadFresh(new URL("./wall.js", import.meta.url).href)
				const html = live.withLive(wallHtml(await dashboardState(config)))
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
		path: "/plugins/dsh-dashboard/echarts.min.js",
		handler: (_req, res) => sendFile(res, join(vendor, "echarts.min.js"), "text/javascript; charset=utf-8"),
	}))
	stops.push(webServer.register({
		kind: "exact",
		path: "/plugins/dsh-dashboard/charts.js",
		handler: (_req, res) => sendFile(res, join(here, "charts.js"), "text/javascript; charset=utf-8"),
	}))
	stops.push(webServer.register({
		kind: "exact",
		path: "/plugins/dsh-dashboard/vue.esm-browser.js",
		handler: (_req, res) => sendFile(res, join(vendor, "vue.esm-browser.js"), "text/javascript; charset=utf-8"),
	}))
	stops.push(webServer.register({
		kind: "exact",
		path: "/plugins/dsh-dashboard/vue-tabs.js",
		handler: (_req, res) => sendFile(res, join(here, "vue-tabs.js"), "text/javascript; charset=utf-8"),
	}))
	stops.push(webServer.register({
		kind: "exact",
		path: "/plugins/dsh-dashboard/tab-catalog.js",
		handler: (_req, res) => sendFile(res, join(here, "tab-catalog.js"), "text/javascript; charset=utf-8"),
	}))
	stops.push(webServer.register({
		kind: "exact",
		path: "/plugins/dsh-dashboard/atelier.js",
		handler: (_req, res) => sendFile(res, join(here, "atelier.js"), "text/javascript; charset=utf-8"),
	}))
	stops.push(webServer.register({
		kind: "exact",
		path: "/plugins/dsh-dashboard/atelier",
		handler: async (_req, res) => {
			try {
				const { atelierHtml } = await loadFresh(new URL("./atelier-page.js", import.meta.url).href)
				res.writeHead(200, {
					"content-type": "text/html; charset=utf-8",
					"cache-control": "no-store",
				})
				res.end(live.withLive(atelierHtml()))
			} catch (error) {
				res.writeHead(500, { "content-type": "text/plain; charset=utf-8" })
				res.end(String(error?.message ?? error))
			}
		},
	}))
	stops.push(webServer.register({
		kind: "exact",
		path: "/plugins/dsh-dashboard/api/state",
		handler: async (_req, res) => {
			try { json(res, 200, await dashboardState(config)) }
			catch (error) { json(res, 500, { error: String(error?.message ?? error) }) }
		},
	}))
	return () => { for (const stop of stops) stop?.() }
}
