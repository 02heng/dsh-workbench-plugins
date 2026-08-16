import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { parseVisual } from "./see.js"

function extFor(mediaType) {
	switch (String(mediaType ?? "")) {
		case "image/jpeg": return ".jpg"
		case "image/webp": return ".webp"
		case "image/gif": return ".gif"
		case "image/bmp": return ".bmp"
		default: return ".png"
	}
}

function withImage(info) {
	if (!info || typeof info !== "object") return info
	const mods = new Set(info.inputModalities ?? ["text"])
	mods.add("text")
	mods.add("image")
	return { ...info, inputModalities: [...mods] }
}

function attachmentsOf(ctx) {
	try {
		if (typeof ctx?.get === "function") return ctx.get("attachments")
	} catch { /* Cordis：未 inject 时 ctx.attachments 会直接抛 */ }
	return undefined
}

async function describeBlock(block, ctx, config) {
	const attachments = attachmentsOf(ctx)
	if (!attachments?.readImage) {
		return "【附图】主模型没有视觉，附件服务不可用，无法转写。"
	}
	const stored = await attachments.readImage(block.attachment)
	const scratch = config.scratch || "D:/dsh-workbench/vision-scratch"
	await mkdir(scratch, { recursive: true })
	const raw = String(stored?.ref?.name || `chat-${Date.now()}`).replace(/[\\/:*?"<>|]/g, "_")
	const ext = extFor(stored?.ref?.mediaType)
	const stamp = Date.now().toString(36)
	const file = join(scratch, raw.toLowerCase().endsWith(ext) ? `${stamp}-${raw}` : `${stamp}-${raw}${ext}`)
	await writeFile(file, Buffer.from(stored.data))
	try {
		const parsed = await parseVisual(file, {
			question: "请读出图中的文字、界面和关键信息，用中文说明。",
			mode: "auto",
			config,
		})
		return `【附图已转写 · ${parsed.engine}】\n路径：${file}\n${parsed.text}`
	} catch (error) {
		return `【附图转写失败】${String(error?.message ?? error)}。可把图放到 D:\\dsh-workbench\\docs 再用 vision_parse。`
	}
}

export async function flattenOptions(options, ctx, config) {
	const messages = options?.messages
	if (!Array.isArray(messages)) return options
	let changed = false
	const next = []
	for (const message of messages) {
		const blocks = message?.content
		if (!Array.isArray(blocks) || !blocks.some((block) => block?.type === "image")) {
			next.push(message)
			continue
		}
		changed = true
		const content = []
		for (const block of blocks) {
			if (block?.type !== "image") {
				content.push(block)
				continue
			}
			try {
				content.push({ type: "text", text: await describeBlock(block, ctx, config) })
			} catch (error) {
				content.push({ type: "text", text: `【附图转写失败】${String(error?.message ?? error)}` })
			}
		}
		next.push({ ...message, content })
	}
	return changed ? { ...options, messages: next } : options
}

function wrapAdapter(adapter, ctx, config) {
	if (!adapter || adapter.__dshVisionWrapped) return
	adapter.__dshVisionWrapped = true
	const origResolve = typeof adapter.resolveModel === "function" ? adapter.resolveModel.bind(adapter) : null
	if (origResolve) {
		adapter.resolveModel = async (...args) => {
			const info = await origResolve(...args)
			return info?.inputModalities?.includes("image") ? info : withImage(info)
		}
	}
	if (typeof adapter.listModels === "function") {
		const orig = adapter.listModels.bind(adapter)
		adapter.listModels = async (...args) => (await orig(...args)).map((info) => (
			info?.inputModalities?.includes("image") ? info : withImage(info)
		))
	}
	if (typeof adapter.stream === "function") {
		const orig = adapter.stream.bind(adapter)
		adapter.stream = async function* (options) {
			let nativeVision = false
			if (origResolve && options?.provider && options?.model) {
				try {
					const info = await origResolve(options.provider, options.model, options.signal)
					nativeVision = Boolean(info?.inputModalities?.includes("image"))
				} catch { /* 按无视觉处理 */ }
			}
			yield* orig(nativeVision ? options : await flattenOptions(options, ctx, config))
		}
	}
}

function adapterMap(llm) {
	if (llm?.adapters instanceof Map) return llm.adapters
	if (!llm) return null
	for (const key of Object.getOwnPropertyNames(llm)) {
		const value = llm[key]
		if (!(value instanceof Map) || value.size === 0) continue
		const first = value.values().next().value
		if (first?.adapter && typeof first.adapter.stream === "function") return value
	}
	return null
}

function eachAdapter(llm, visit) {
	const map = adapterMap(llm)
	if (!map) return
	for (const row of map.values()) {
		if (row?.adapter) visit(row.adapter)
	}
}

export function installVisionBridge(ctx, config) {
	const llm = ctx.llm
	if (!llm) return () => {}

	const origInfo = llm.resolveModelInfo.bind(llm)
	llm.resolveModelInfo = async (provider, model, signal) => withImage(await origInfo(provider, model, signal))

	const origList = llm.listModels.bind(llm)
	llm.listModels = async (provider) => (await origList(provider)).map(withImage)

	const wrapAll = () => {
		let n = 0
		eachAdapter(llm, (adapter) => {
			const fresh = !adapter.__dshVisionWrapped
			wrapAdapter(adapter, ctx, config)
			if (fresh) n += 1
		})
		if (n) ctx.logger?.info?.(`dsh-vision: 已接管 ${n} 个模型适配器，对话附图会先转成文字`)
	}
	wrapAll()
	const timers = [200, 800, 2000].map((ms) => setTimeout(wrapAll, ms))
	const off = ctx.on("llm/adapters-updated", wrapAll)
	ctx.logger?.info?.("dsh-vision: 对话附图通道已打开（DeepSeek 等无视觉模型也可贴图）")
	return () => {
		for (const timer of timers) clearTimeout(timer)
		off?.()
		llm.resolveModelInfo = origInfo
		llm.listModels = origList
	}
}
