import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { createLive, loadFresh } from "../../dsh-work-ui/live.js"
import { ingestBuffer, loadIndex, removeDoc, toKb } from "./inbox.js"

const here = dirname(fileURLToPath(import.meta.url))

const MAX_BYTES = 20 * 1024 * 1024

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

async function readBody(req) {
	const chunks = []
	for await (const chunk of req) chunks.push(chunk)
	if (chunks.length === 0) return {}
	return JSON.parse(Buffer.concat(chunks).toString("utf8"))
}

function headerValue(headers, name) {
	const text = String(headers ?? "")
	const starred = new RegExp(`${name}\\*=(?:UTF-8'')?([^;\\r\\n]+)`, "i").exec(text)
	if (starred) {
		try { return decodeURIComponent(starred[1].trim().replace(/^"|"$/g, "")) } catch { /* fall through */ }
	}
	const quoted = new RegExp(`${name}="([^"]*)"`, "i").exec(text)
	if (quoted) return quoted[1].trim()
	const plain = new RegExp(`${name}=([^;\\r\\n]+)`, "i").exec(text)
	return plain ? plain[1].trim().replace(/^"|"$/g, "") : ""
}

export async function readMultipart(req) {
	const ctype = String(req.headers["content-type"] ?? "")
	const match = /boundary=([^;]+)/i.exec(ctype)
	if (!match) throw new Error("需要 multipart/form-data")
	const boundary = match[1].trim().replace(/^"|"$/g, "")
	const chunks = []
	let size = 0
	for await (const chunk of req) {
		size += chunk.length
		if (size > MAX_BYTES) throw new Error("文件超过 20MB")
		chunks.push(chunk)
	}
	const buf = Buffer.concat(chunks)
	const sep = Buffer.from(`--${boundary}`)
	const fields = {}
	let file
	let offset = 0
	while (offset < buf.length) {
		const start = buf.indexOf(sep, offset)
		if (start < 0) break
		offset = start + sep.length
		if (buf.slice(offset, offset + 2).toString() === "--") break
		if (buf.slice(offset, offset + 2).toString() === "\r\n") offset += 2
		const headerEnd = buf.indexOf("\r\n\r\n", offset)
		if (headerEnd < 0) break
		const headers = buf.slice(offset, headerEnd).toString("utf8")
		offset = headerEnd + 4
		const next = buf.indexOf(sep, offset)
		const end = next < 0 ? buf.length : next - 2
		const body = buf.slice(offset, end)
		offset = next < 0 ? buf.length : next
		const name = headerValue(headers, "name")
		const filename = headerValue(headers, "filename")
		if (filename) {
			file = { filename: filename.replace(/^.*[\\/]/, ""), buffer: body }
		} else if (name) {
			fields[name] = body.toString("utf8")
		}
	}
	if (!file) throw new Error("没有收到文件")
	return { file, fields }
}

export function registerInbox(webServer, { root, kbRoot }) {
	const stops = []
	const live = createLive({
		dirs: [here],
		path: "/plugins/dsh-docs/live",
	})
	stops.push(live.register(webServer))
	stops.push(webServer.register({
		kind: "exact",
		path: "/plugins/dsh-docs/inbox",
		handler: async (_req, res) => {
			try {
				const { inboxHtml } = await loadFresh(new URL("./inbox-page.js", import.meta.url).href)
				const index = await loadIndex(root)
				res.writeHead(200, {
					"content-type": "text/html; charset=utf-8",
					"cache-control": "no-store",
				})
				res.end(live.withLive(inboxHtml(index)))
			} catch (error) {
				res.writeHead(500, { "content-type": "text/plain; charset=utf-8" })
				res.end(String(error?.message ?? error))
			}
		},
	}))
	stops.push(webServer.register({
		kind: "exact",
		path: "/plugins/dsh-docs/api/list",
		handler: async (_req, res) => {
			try { json(res, 200, await loadIndex(root)) }
			catch (error) { json(res, 500, { error: String(error?.message ?? error) }) }
		},
	}))
	stops.push(webServer.register({
		kind: "exact",
		path: "/plugins/dsh-docs/api/upload",
		handler: async (req, res) => {
			try {
				if ((req.method ?? "GET") !== "POST") return json(res, 405, { error: "POST only" })
				if (!sameOrigin(req)) return json(res, 403, { error: "forbidden" })
				const { file, fields } = await readMultipart(req)
				const record = await ingestBuffer(root, file.filename, file.buffer, {
					toKb: fields.toKb === "1" || fields.toKb === "true",
					kbRoot,
					collection: fields.collection || "notes",
				})
				json(res, 200, record)
			} catch (error) {
				json(res, 400, { error: String(error?.message ?? error) })
			}
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
	write("/plugins/dsh-docs/api/to-kb", (body) => toKb(root, kbRoot, body.id, body.collection || "notes"))
	write("/plugins/dsh-docs/api/delete", (body) => removeDoc(root, body.id))
	return () => { for (const stop of stops) stop?.() }
}
