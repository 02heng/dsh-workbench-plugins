import { readFile } from "node:fs/promises"
import JSZip from "jszip"
import PptxGenJS from "pptxgenjs"

function stripXml(xml) {
	return xml
		.replace(/<a:t[^>]*>/g, "")
		.replace(/<\/a:t>/g, "\n")
		.replace(/<[^>]+>/g, "")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/\n{2,}/g, "\n")
		.trim()
}

export async function readPpt(path) {
	const zip = await JSZip.loadAsync(await readFile(path))
	const names = Object.keys(zip.files)
		.filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
		.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
	const slides = []
	for (const name of names) {
		const xml = await zip.files[name].async("string")
		slides.push({ file: name, text: stripXml(xml) })
	}
	return { path, slideCount: slides.length, slides }
}

export async function writePpt(path, title, slides) {
	const pptx = new PptxGenJS()
	pptx.author = "工作模式"
	pptx.title = title || "演示文稿"
	if (title) {
		const cover = pptx.addSlide()
		cover.addText(String(title), {
			x: 0.6,
			y: 2.2,
			w: 8.5,
			h: 1.2,
			fontSize: 32,
			bold: true,
			color: "0B1F33",
			fontFace: "Microsoft YaHei",
		})
	}
	for (const slide of slides) {
		const page = pptx.addSlide()
		if (slide.title) {
			page.addText(String(slide.title), {
				x: 0.5,
				y: 0.35,
				w: 9,
				h: 0.7,
				fontSize: 22,
				bold: true,
				color: "0B1F33",
				fontFace: "Microsoft YaHei",
			})
		}
		const bullets = Array.isArray(slide.bullets) ? slide.bullets : []
		if (bullets.length > 0) {
			page.addText(
				bullets.map((item) => ({ text: String(item), options: { bullet: true, breakLine: true } })),
				{
					x: 0.6,
					y: 1.2,
					w: 8.8,
					h: 4.6,
					fontSize: 16,
					color: "1F2933",
					fontFace: "Microsoft YaHei",
					valign: "top",
				},
			)
		}
	}
	await pptx.writeFile({ fileName: path })
	return { path, slides: slides.length + (title ? 1 : 0) }
}
