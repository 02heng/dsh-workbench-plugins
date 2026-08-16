import { readFile } from "node:fs/promises"
import { extname } from "node:path"
import { createRequire } from "node:module"
import { readExcel } from "./excel.js"
import { readPpt } from "./ppt.js"
import { readWord } from "./word.js"

const require = createRequire(import.meta.url)
const MAX_CHARS = 200_000

export const ALLOWED_EXT = [".docx", ".xlsx", ".pptx", ".pdf", ".txt", ".md", ".csv", ".json", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"]
const IMAGE_EXT = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"]

function clip(text) {
	const value = String(text ?? "").replace(/\u0000/g, "").trim()
	if (value.length <= MAX_CHARS) return { text: value, truncated: false }
	return { text: value.slice(0, MAX_CHARS), truncated: true }
}

function rowsToMarkdown(rows) {
	return rows.map((row) => `| ${row.values.map((cell) => String(cell).replace(/\|/g, "\\|")).join(" | ")} |`).join("\n")
}

async function parsePdf(path) {
	let pdfParse
	try {
		pdfParse = require("pdf-parse/lib/pdf-parse.js")
	} catch {
		pdfParse = require("pdf-parse")
	}
	const buffer = await readFile(path)
	const result = await pdfParse(buffer)
	return {
		kind: "pdf",
		pages: result.numpages,
		...clip(result.text),
	}
}

export async function parseDocument(path) {
	const ext = extname(path).toLowerCase()
	if (ext === ".doc") {
		throw new Error("旧版 .doc 请先另存为 .docx")
	}
	if (!ALLOWED_EXT.includes(ext)) {
		throw new Error(`不支持 ${ext || "无扩展名"}。可用：${ALLOWED_EXT.join(" ")}`)
	}
	if (ext === ".docx") {
		const result = await readWord(path)
		return { kind: "docx", warnings: result.warnings, ...clip(result.text) }
	}
	if (ext === ".xlsx") {
		const result = await readExcel(path, undefined, 200)
		const header = result.rows[0] ? `| ${result.rows[0].values.map(() => "---").join(" | ")} |` : ""
		const table = result.rows.length > 0
			? `${rowsToMarkdown([result.rows[0]])}\n${header}\n${rowsToMarkdown(result.rows.slice(1))}`
			: "(空表)"
		const text = `# ${result.sheet}\n\n工作表：${result.sheets.join("、")}\n\n${table}`
		return { kind: "xlsx", sheet: result.sheet, sheets: result.sheets, rowCount: result.rowCount, ...clip(text) }
	}
	if (ext === ".pptx") {
		const result = await readPpt(path)
		const text = result.slides.map((slide, index) => `## 第 ${index + 1} 页\n\n${slide.text}`).join("\n\n")
		return { kind: "pptx", slideCount: result.slideCount, ...clip(text) }
	}
	if (IMAGE_EXT.includes(ext)) {
		const { parseVisual } = await import("../../dsh-vision/lib/see.js")
		return parseVisual(path, { mode: "auto" })
	}
	if (ext === ".pdf") {
		const parsed = await parsePdf(path)
		if (parsed.text.replace(/\s+/g, "").length >= 40) return parsed
		return {
			...parsed,
			text: `${parsed.text}\n\n（正文很少，可能是扫描件。请把关键页另存为图片后用 vision_parse，或再拖一张截图进收件箱。）`.trim(),
		}
	}
	const raw = await readFile(path, "utf8")
	return { kind: ext.slice(1), ...clip(raw) }
}
