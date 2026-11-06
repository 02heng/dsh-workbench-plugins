function blockText(block) {
	if (!block || typeof block !== "object") return ""
	if (block.type === "text") return String(block.text ?? "")
	if (block.type === "image") return ""
	if (block.type === "tool-call") return ""
	if (block.type === "tool-result") {
		const inner = Array.isArray(block.content) ? block.content.map(blockText).join("\n") : ""
		return inner
	}
	return ""
}

function messageText(message) {
	const content = message?.content
	if (typeof content === "string") return content
	return (content ?? []).map(blockText).filter(Boolean).join("\n")
}

function imagePart(block) {
	if (typeof block.url === "string" && block.url.startsWith("data:")) {
		return { type: "image_url", image_url: { url: block.url } }
	}
	if (typeof block.data === "string" && block.data) {
		const mime = block.mimeType || block.media_type || "image/png"
		const url = block.data.startsWith("data:") ? block.data : `data:${mime};base64,${block.data}`
		return { type: "image_url", image_url: { url } }
	}
	if (typeof block.url === "string" && block.url) {
		return { type: "image_url", image_url: { url: block.url } }
	}
	return null
}

function serializeAssistant(message) {
	const blocks = Array.isArray(message?.content) ? message.content : []
	const text = messageText(message)
	const reasoning = blocks.filter((block) => block?.type === "reasoning").map((block) => block.text).join("")
	const toolCalls = blocks.filter((block) => block?.type === "tool-call").map((block) => ({
		id: block.id,
		type: "function",
		function: { name: block.name, arguments: block.arguments ?? "{}" },
	}))
	const out = { role: "assistant", content: text }
	if (reasoning) out.reasoning_content = reasoning
	if (toolCalls.length) out.tool_calls = toolCalls
	return out
}

function toolResultText(block) {
	const inner = Array.isArray(block.content) ? block.content.map(blockText).join("\n") : String(block.content ?? "")
	return inner || "(no output)"
}

export function toOpenAiTools(tools) {
	return (tools ?? []).map((tool) => ({
		type: "function",
		function: {
			name: tool.name,
			description: tool.description,
			parameters: tool.parameters ?? { type: "object", "properties": {} },
		},
	}))
}

export function toOpenAiMessages(options) {
	const out = []
	if (options?.system) out.push({ role: "system", content: String(options.system) })
	for (const message of options?.messages ?? []) {
		if (message.role === "system") {
			const text = messageText(message)
			if (text) out.push({ role: "system", content: text })
			continue
		}
		if (message.role === "assistant") {
			out.push(serializeAssistant(message))
			continue
		}
		const blocks = Array.isArray(message.content)
			? message.content
			: [{ type: "text", text: String(message.content ?? "") }]
		const texts = []
		const images = []
		const toolResults = []
		for (const block of blocks) {
			if (!block || typeof block !== "object") continue
			if (block.type === "tool-result") toolResults.push(block)
			else if (block.type === "image") images.push(block)
			else if (block.type === "text" && block.text) texts.push(block.text)
			else if (block.type === "reasoning") continue
		}
		const text = texts.join("\n")
		if (text || images.length) {
			if (images.length) {
				const parts = []
				if (text) parts.push({ type: "text", text })
				for (const image of images) {
					const part = imagePart(image)
					if (part) parts.push(part)
				}
				out.push({ role: "user", content: parts.length ? parts : text || "" })
			} else {
				out.push({ role: "user", content: text })
			}
		} else if (toolResults.length === 0) {
			const fallback = messageText(message)
			if (fallback) out.push({ role: "user", content: fallback })
		}
		for (const result of toolResults) {
			out.push({
				role: "tool",
				tool_call_id: result.toolCallId || "",
				content: toolResultText(result),
			})
		}
	}
	return out
}
