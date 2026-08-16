export const CHAT_RULE = "用中文回复用户。只回答，不要自己改文件、跑命令、写测试或搜索工作区。工作区改动由 Harness 自己的工具完成。不要调用 cursor_delegate。不要把密钥写进对话。"

function blockText(block) {
	if (!block || typeof block !== "object") return ""
	if (block.type === "text") return String(block.text ?? "")
	if (block.type === "reasoning") return `(thinking: ${String(block.text ?? "")})`
	if (block.type === "tool-call") return `[tool-call ${block.name} ${block.arguments ?? ""}]`
	if (block.type === "tool-result") {
		const inner = Array.isArray(block.content) ? block.content.map(blockText).join("\n") : ""
		return `[tool-result ${block.toolCallId}${block.isError ? " ERROR" : ""}]\n${inner}`
	}
	if (block.type === "image") return "[image]"
	return ""
}

function messageText(message) {
	return (message?.content ?? []).map(blockText).filter(Boolean).join("\n")
}

export function flattenRequest(options, extras = {}) {
	if (options.purpose === "session-title") {
		return "只输出一个很短的会话标题，不要解释。"
	}

	const messages = options.messages ?? []
	if (extras.live) {
		const last = messages.at(-1)
		const body = messageText(last)
		return [`# ${last?.role || "user"}\n${body}`, CHAT_RULE].join("\n\n")
	}

	const parts = [
		"你是 DeepSeek Harness 网页里的助手。不要使用任何本地工具。",
		CHAT_RULE,
	]
	for (const message of messages) {
		const body = messageText(message)
		if (body) parts.push(`# ${message.role}\n${body}`)
	}
	return parts.join("\n\n")
}

export function sessionCwd(options, fallback = "D:/dsh-workbench") {
	return fallback
}
