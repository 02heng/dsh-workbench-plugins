import { readFile } from "node:fs/promises"
import { extname, join, normalize, sep } from "node:path"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL(".", import.meta.url))

const TYPES = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".mjs": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".map": "application/json; charset=utf-8",
}

function safeFile(urlPath) {
	const rel = decodeURIComponent(String(urlPath || "").replace(/^\/plugins\/dsh-work-ui\/?/, ""))
	if (!rel || rel.includes("\0")) return null
	const dest = normalize(join(root, rel))
	if (!dest.startsWith(root)) return null
	if (dest.split(sep).includes("..")) return null
	return dest
}

export function registerWorkUi(webServer) {
	return webServer.register({
		kind: "prefix",
		path: "/plugins/dsh-work-ui/",
		handler: async (req, res) => {
			const url = new URL(req.url || "/", "http://127.0.0.1")
			const pathname = url.pathname === "/plugins/dsh-work-ui/app"
				? "/plugins/dsh-work-ui/app.html"
				: url.pathname
			const file = safeFile(pathname)
			if (!file) {
				res.writeHead(404, { "content-type": "text/plain; charset=utf-8" })
				res.end("missing")
				return
			}
			try {
				const buf = await readFile(file)
				res.writeHead(200, {
					"content-type": TYPES[extname(file)] || "application/octet-stream",
					"cache-control": "no-store",
				})
				res.end(buf)
			} catch {
				res.writeHead(404, { "content-type": "text/plain; charset=utf-8" })
				res.end("missing")
			}
		},
	})
}
