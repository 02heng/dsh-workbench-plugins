import { readFile } from "node:fs/promises"
import { extname, join, sep } from "node:path"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL(".", import.meta.url))

const TYPES = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".mjs": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
}

function typeOf(file) {
	return TYPES[extname(file)] || "application/octet-stream"
}

function send(res, file) {
	return readFile(file).then((buf) => {
		res.writeHead(200, { "content-type": typeOf(file), "cache-control": "no-store" })
		res.end(buf)
	}).catch(() => {
		res.writeHead(404, { "content-type": "text/plain; charset=utf-8" })
		res.end("missing")
	})
}

export function registerWorkUi(webServer) {
	const stops = []
	const seen = new Set()
	const add = (path, file) => {
		if (seen.has(path)) return
		seen.add(path)
		stops.push(webServer.register({
			kind: "exact",
			path,
			handler: (_req, res) => send(res, join(root, file)),
		}))
	}
	add("/plugins/dsh-work-ui/app", "app.html")
	add("/plugins/dsh-work-ui/app.html", "app.html")
	add("/plugins/dsh-work-ui/theme.css", "theme.css")
	add("/plugins/dsh-work-ui/mount.js", "mount.js")
	add("/plugins/dsh-work-ui/router.js", "router.js")
	add("/plugins/dsh-work-ui/tab-bridge.js", "tab-bridge.js")
	add("/plugins/dsh-work-ui/lazy-tab.js", "lazy-tab.js")
	add("/plugins/dsh-work-ui/time.js", "time.js")
	add("/plugins/dsh-work-ui/ledger.js", "ledger.js")
	add("/plugins/dsh-work-ui/live.js", "live.js")
	add("/plugins/dsh-work-ui/pages/ui.js", "pages/ui.js")
	add("/plugins/dsh-work-ui/pages/desk.js", "pages/desk.js")
	add("/plugins/dsh-work-ui/pages/inbox.js", "pages/inbox.js")
	add("/plugins/dsh-work-ui/pages/board.js", "pages/board.js")
	add("/plugins/dsh-work-ui/pages/wall.js", "pages/wall.js")
	add("/plugins/dsh-work-ui/pages/atelier.js", "pages/atelier.js")
	add("/plugins/dsh-work-ui/vendor/react.production.min.js", "vendor/react.production.min.js")
	add("/plugins/dsh-work-ui/vendor/react-dom.production.min.js", "vendor/react-dom.production.min.js")
	stops.push(webServer.register({
		kind: "prefix",
		path: "/plugins/dsh-work-ui/",
		handler: async (req, res) => {
			const url = new URL(req.url || "/", "http://127.0.0.1")
			const rel = decodeURIComponent(url.pathname.replace(/^\/plugins\/dsh-work-ui\/?/, ""))
			if (!rel || rel.includes("..") || rel.includes("\0")) {
				res.writeHead(404, { "content-type": "text/plain; charset=utf-8" })
				res.end("missing")
				return
			}
			await send(res, join(root, rel.split("/").join(sep)))
		},
	}))
	return () => { for (const stop of stops) stop?.() }
}
