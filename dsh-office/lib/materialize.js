import { mkdir } from "node:fs/promises"
import { join } from "node:path"
import { writeExcel } from "./excel.js"
import { writePpt } from "./ppt.js"
import { writeWord } from "./word.js"

const DOC_HINT = /通知|公文|汇总|表格|课表|名册|课件|幻灯片|ppt|pptx|word|excel|xlsx|docx|文档|方案|报告|清单|台账|纪要|通报|调研|名录/i
const PPT_HINT = /ppt|pptx|课件|幻灯片|演示/i
const XLS_HINT = /excel|xlsx|表格|课表|名册|台账|清单/i

export function wantsDocument(userText) {
	return DOC_HINT.test(String(userText || ""))
}

export function blocksText(content) {
	if (typeof content === "string") return content.trim()
	if (!Array.isArray(content)) return ""
	return content
		.map((block) => {
			if (typeof block === "string") return block
			if (block?.type === "text") return String(block.text ?? "")
			return ""
		})
		.filter(Boolean)
		.join("\n")
		.trim()
}

function sessionMessages(session) {
	if (typeof session?.deriveMessages === "function") return session.deriveMessages() ?? []
	if (Array.isArray(session?.messages)) return session.messages
	return []
}

export function lastRoleText(session, role) {
	const messages = sessionMessages(session)
	for (let i = messages.length - 1; i >= 0; i--) {
		if (messages[i]?.role === role) return blocksText(messages[i].content)
	}
	return ""
}

export function hasOfficeWriteCall(session) {
	for (const message of sessionMessages(session)) {
		const blocks = Array.isArray(message?.content) ? message.content : []
		for (const block of blocks) {
			if (block?.type === "tool-call" && /^office_(word|excel|ppt)_write$/.test(String(block.name || ""))) {
				return true
			}
		}
	}
	return false
}

export function parseOfficeFence(text) {
	const raw = String(text || "")
	const hit = raw.match(/```(?:office(?:-json)?)[^\n]*\n([\s\S]*?)```/i)
	if (!hit) return null
	try {
		const data = JSON.parse(hit[1])
		if (!data || typeof data !== "object") return null
		const kind = String(data.kind || data.type || "").toLowerCase()
		if (!["word", "excel", "ppt"].includes(kind)) return null
		return { ...data, kind }
	} catch {
		return null
	}
}

export function markdownTables(text) {
	const lines = String(text || "").split(/\r?\n/)
	const tables = []
	let current = []
	const flush = () => {
		const rows = current
			.filter((line) => !/^\s*\|?\s*:?-{3,}/.test(line))
			.map((line) => line
				.replace(/^\s*\|/, "")
				.replace(/\|\s*$/, "")
				.split("|")
				.map((cell) => cell.trim()))
			.filter((row) => row.some((cell) => cell))
		if (rows.length >= 2) tables.push(rows)
		current = []
	}
	for (const line of lines) {
		if (/^\s*\|/.test(line) || (/\|/.test(line) && current.length)) {
			current.push(line)
			continue
		}
		if (current.length) flush()
	}
	if (current.length) flush()
	return tables
}

export function inferKind(userText, assistantText) {
	const fenced = parseOfficeFence(assistantText)
	if (fenced?.kind) return fenced.kind
	const user = String(userText || "")
	if (PPT_HINT.test(user)) return "ppt"
	if (XLS_HINT.test(user) || markdownTables(assistantText).length) return "excel"
	return "word"
}

export function slugName(value, fallback = "文稿") {
	const raw = String(value || fallback)
		.replace(/[\\/:*?"<>|]/g, "_")
		.replace(/\s+/g, "-")
		.replace(/^微信·/, "")
		.slice(0, 40)
		.replace(/^-+|-+$/g, "")
	return raw || fallback
}

function wordParagraphs(text, fenced) {
	if (Array.isArray(fenced?.paragraphs) && fenced.paragraphs.length) {
		return fenced.paragraphs.map((item) => String(item))
	}
	if (typeof fenced?.body === "string" && fenced.body.trim()) {
		return fenced.body.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean)
	}
	const cleaned = String(text || "")
		.replace(/```(?:office(?:-json)?)[\s\S]*?```/ig, "")
		.replace(/^#{1,6}\s+/gm, "")
		.trim()
	const parts = cleaned.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean)
	return parts.length ? parts : [cleaned || "（空）"]
}

function excelRows(text, fenced) {
	if (Array.isArray(fenced?.rows) && fenced.rows.length) return fenced.rows
	const tables = markdownTables(text)
	if (tables.length) return tables[0]
	return String(text || "")
		.split(/\r?\n/)
		.map((line) => [line.trim()])
		.filter((row) => row[0])
}

function pptSlides(text, fenced, title) {
	if (Array.isArray(fenced?.slides) && fenced.slides.length) return fenced.slides
	const body = String(text || "").replace(/```(?:office(?:-json)?)[\s\S]*?```/ig, "").trim()
	const chunks = body.split(/^##\s+/m).map((item) => item.trim()).filter(Boolean)
	if (chunks.length > 1 || /^##\s+/m.test(body)) {
		return chunks.map((chunk) => {
			const [head, ...rest] = chunk.split(/\n/)
			const bullets = rest
				.map((line) => line.replace(/^\s*[-*•]\s*/, "").trim())
				.filter(Boolean)
			return { title: head.replace(/^#+\s*/, ""), bullets: bullets.length ? bullets : [head] }
		})
	}
	const bullets = body.split(/\n+/).map((line) => line.replace(/^\s*[-*•]\s*/, "").trim()).filter(Boolean)
	return [{ title: title || "要点", bullets: bullets.slice(0, 12) }]
}

export async function materializeFromTurn(opts = {}) {
	const assistantText = String(opts.assistantText || "").trim()
	if (assistantText.length < 20) return null
	const fenced = parseOfficeFence(assistantText)
	const kind = opts.kind || inferKind(opts.userText, assistantText)
	const destDir = opts.destDir || "D:/dsh-workbench/docs"
	const base = slugName(opts.basename, "文稿")
	await mkdir(destDir, { recursive: true })
	const title = String(fenced?.title || opts.title || base)
	if (kind === "excel") {
		const rows = excelRows(assistantText, fenced)
		const headers = Array.isArray(fenced?.headers) ? fenced.headers : rows[0]
		const body = Array.isArray(fenced?.headers) ? rows : rows.slice(1)
		const path = join(destDir, `${base}.xlsx`)
		await writeExcel(path, fenced?.sheet, headers, body)
		return { path, kind: "excel" }
	}
	if (kind === "ppt") {
		const path = join(destDir, `${base}.pptx`)
		await writePpt(path, title, pptSlides(assistantText, fenced, title))
		return { path, kind: "ppt" }
	}
	const path = join(destDir, `${base}.docx`)
	await writeWord(path, title, wordParagraphs(assistantText, fenced))
	return { path, kind: "word" }
}
