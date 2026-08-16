import { readFile } from "node:fs/promises"
import { ocrWindows } from "./ocr-win.js"
import { IMAGE_EXT, isImagePath, mimeFor, mustBeOnD } from "./paths.js"
import { describeCursor } from "./vl-cursor.js"
import { describeOpenAi } from "./vl-openai.js"

const DEFAULT_SCRATCH = "D:/dsh-workbench/vision-scratch"

function env(name) {
	const value = process.env[name]
	return typeof value === "string" && value.trim() ? value.trim() : ""
}

export function visionStatus(config = {}) {
	const openai = Boolean(env(config.apiKeyEnv || "VISION_API_KEY") && env("VISION_BASE_URL") && env("VISION_MODEL"))
	const cursor = Boolean(env(config.cursorApiKeyEnv || "CURSOR_API_KEY"))
	return {
		openai,
		cursor,
		ocr: process.platform === "win32",
		eyes: openai ? "openai" : cursor ? "cursor" : "ocr-only",
	}
}

export async function ocrImage(path) {
	if (process.platform !== "win32") throw new Error("本地 OCR 目前只接了 Windows")
	return ocrWindows(mustBeOnD(path))
}

export async function describeImage(path, question, config = {}, signal) {
	const file = mustBeOnD(path)
	const status = visionStatus(config)
	if (status.openai) {
		const buffer = await readFile(file)
		return {
			engine: "openai",
			text: await describeOpenAi({
				baseUrl: env("VISION_BASE_URL"),
				apiKey: env(config.apiKeyEnv || "VISION_API_KEY"),
				model: env("VISION_MODEL"),
				mime: mimeFor(file),
				base64: buffer.toString("base64"),
				question,
			}),
		}
	}
	if (status.cursor) {
		return {
			engine: "cursor",
			text: await describeCursor({
				apiKey: env(config.cursorApiKeyEnv || "CURSOR_API_KEY"),
				model: config.cursorModel || env("VISION_CURSOR_MODEL") || "composer-2.5",
				imagePath: file,
				scratch: config.scratch || DEFAULT_SCRATCH,
				question,
				signal,
			}),
		}
	}
	throw new Error("没有可用的视觉模型。可设 VISION_BASE_URL / VISION_API_KEY / VISION_MODEL，或保持 CURSOR_API_KEY 用 Cursor 当眼睛。")
}

export async function parseVisual(path, { question, mode = "auto", config = {}, signal } = {}) {
	const file = mustBeOnD(path)
	if (!isImagePath(file)) {
		throw new Error(`不是图片：${file}。可用 ${IMAGE_EXT.join(" ")}`)
	}
	const want = String(mode || "auto")
	let ocr = ""
	let ocrError = ""
	if (want !== "describe") {
		try { ocr = await ocrImage(file) }
		catch (error) { ocrError = String(error?.message ?? error) }
	}

	const compact = ocr.replace(/\s+/g, "")
	const cjk = (compact.match(/[\u3400-\u9FFF]/g) || []).length
	const ocrEnough = cjk >= 4 || compact.length >= 20
	const needEyes = want === "describe" || Boolean(question) || (want === "auto" && !ocrEnough)
	let eyes
	let eyesError = ""
	if (needEyes) {
		try { eyes = await describeImage(file, question, config, signal) }
		catch (error) { eyesError = String(error?.message ?? error) }
	}

	const parts = []
	if (ocr) parts.push(`【本地 OCR】\n${ocr}`)
	if (eyes?.text) parts.push(`【视觉 ${eyes.engine}】\n${eyes.text}`)
	if (!parts.length) {
		throw new Error([ocrError && `OCR：${ocrError}`, eyesError && `视觉：${eyesError}`].filter(Boolean).join("；") || "没有解析出内容")
	}

	const text = parts.join("\n\n")
	const result = {
		kind: "image",
		engine: eyes?.engine ? (ocr ? `ocr+${eyes.engine}` : eyes.engine) : "ocr",
		ocrChars: ocr.length,
		text,
		truncated: false,
	}
	if (eyesError && ocr) result.note = `视觉通道未用上：${eyesError}`
	return result
}
