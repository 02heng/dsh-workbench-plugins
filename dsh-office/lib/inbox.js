import { mkdir, readFile, unlink, writeFile } from "node:fs/promises"
import { basename, extname, join, resolve } from "node:path"
import { parseDocument } from "./parse.js"

const INDEX = "index.json"

function safeName(name) {
	const base = basename(String(name ?? "未命名")).replace(/[\\/:*?"<>|]/g, "_").trim() || "未命名"
	return base.slice(0, 120)
}

function nowId() {
	return `doc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

export function resolveDocsRoot(root) {
	const value = String(root ?? "D:/dsh-workbench/docs").trim() || "D:/dsh-workbench/docs"
	if (!/^[dD]:[\\/]/.test(value)) {
		throw new Error("文档收件箱必须在 D 盘")
	}
	return resolve(value)
}

export async function ensureInbox(root) {
	await mkdir(join(root, "inbox"), { recursive: true })
	await mkdir(join(root, "parsed"), { recursive: true })
	try {
		await readFile(join(root, INDEX), "utf8")
	} catch {
		await writeFile(join(root, INDEX), JSON.stringify({ docs: [] }, null, 2), "utf8")
	}
	return root
}

export async function loadIndex(root) {
	await ensureInbox(root)
	try {
		return JSON.parse(await readFile(join(root, INDEX), "utf8"))
	} catch {
		return { docs: [] }
	}
}

async function saveIndex(root, data) {
	await writeFile(join(root, INDEX), JSON.stringify({ docs: data.docs }, null, 2), "utf8")
	return data
}

export async function ingestBuffer(root, filename, buffer, { toKb = false, kbRoot, collection = "notes" } = {}) {
	await ensureInbox(root)
	const id = nowId()
	const name = safeName(filename)
	const ext = extname(name).toLowerCase()
	const original = join(root, "inbox", `${id}${ext || ""}`)
	const parsedPath = join(root, "parsed", `${id}.md`)
	await writeFile(original, buffer)
	const parsed = await parseDocument(original)
	const title = name.replace(/\.[^.]+$/, "")
	const markdown = `# ${title}\n\n- 来源：${name}\n- 类型：${parsed.kind}\n- 入库时间：${new Date().toISOString()}\n\n${parsed.text}\n`
	await writeFile(parsedPath, markdown, "utf8")
	let kbPath
	if (toKb && kbRoot) {
		kbPath = await writeToKb(kbRoot, collection, title, parsed.text)
	}
	const record = {
		id,
		name,
		ext: ext || "",
		original,
		parsed: parsedPath,
		bytes: buffer.length,
		chars: parsed.text.length,
		truncated: Boolean(parsed.truncated),
		kind: parsed.kind,
		uploadedAt: new Date().toISOString(),
		toKb: Boolean(kbPath),
		kbPath: kbPath ?? null,
	}
	const index = await loadIndex(root)
	index.docs.unshift(record)
	await saveIndex(root, index)
	return record
}

export async function ingestExisting(root, filePath, options = {}) {
	const buffer = await readFile(filePath)
	return ingestBuffer(root, basename(filePath), buffer, options)
}

export async function writeToKb(kbRoot, collection, title, body) {
	const allowed = ["policies", "dictionary", "recipes", "notes"]
	if (!allowed.includes(collection)) throw new Error(`知识库分类必须是 ${allowed.join(" / ")}`)
	const safe = String(title || "未命名").replace(/[\\/:*?"<>|]/g, "_").slice(0, 80)
	const rel = `${collection}/${safe}.md`
	const file = join(resolve(kbRoot), rel)
	if (!file.toLowerCase().startsWith(resolve(kbRoot).toLowerCase())) {
		throw new Error("知识库路径必须在 D:\\dsh-kb")
	}
	await mkdir(join(resolve(kbRoot), collection), { recursive: true })
	const text = `---\ntitle: ${safe}\ncollection: ${collection}\ntags: ["上传解析"]\n---\n\n${String(body ?? "").trim()}\n`
	await writeFile(file, text, "utf8")
	return rel.replace(/\//g, "\\")
}

export async function toKb(root, kbRoot, id, collection = "notes") {
	const index = await loadIndex(root)
	const doc = index.docs.find((item) => item.id === id)
	if (!doc) throw new Error(`没有这份文档：${id}`)
	const body = await readFile(doc.parsed, "utf8")
	doc.kbPath = await writeToKb(kbRoot, collection, doc.name.replace(/\.[^.]+$/, ""), body)
	doc.toKb = true
	await saveIndex(root, index)
	return doc
}

export async function removeDoc(root, id) {
	const index = await loadIndex(root)
	const doc = index.docs.find((item) => item.id === id)
	if (!doc) throw new Error(`没有这份文档：${id}`)
	for (const path of [doc.original, doc.parsed]) {
		try { await unlink(path) } catch { /* already gone */ }
	}
	index.docs = index.docs.filter((item) => item.id !== id)
	await saveIndex(root, index)
	return { removed: id }
}

export async function readParsed(root, id) {
	const index = await loadIndex(root)
	const doc = index.docs.find((item) => item.id === id)
	if (!doc) throw new Error(`没有这份文档：${id}`)
	return { ...doc, text: await readFile(doc.parsed, "utf8") }
}
