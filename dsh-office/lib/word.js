import { writeFile } from "node:fs/promises"
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx"
import mammoth from "mammoth"

export async function readWord(path) {
	const result = await mammoth.extractRawText({ path })
	return {
		path,
		text: result.value.trim(),
		warnings: (result.messages ?? []).map((item) => item.message).slice(0, 20),
	}
}

export async function writeWord(path, title, paragraphs) {
	const children = []
	if (title) {
		children.push(new Paragraph({
			text: String(title),
			heading: HeadingLevel.HEADING_1,
		}))
	}
	for (const block of paragraphs) {
		const text = String(block ?? "").trim()
		if (!text) {
			children.push(new Paragraph({ text: "" }))
			continue
		}
		children.push(new Paragraph({
			children: [new TextRun({ text, font: "微软雅黑" })],
			spacing: { after: 200 },
		}))
	}
	const doc = new Document({
		sections: [{
			properties: {},
			children: children.length > 0 ? children : [new Paragraph({ text: "" })],
		}],
	})
	const buffer = await Packer.toBuffer(doc)
	await writeFile(path, buffer)
	return { path, paragraphs: paragraphs.length }
}
