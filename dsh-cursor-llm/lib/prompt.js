import { readFileSync } from "node:fs"
import { promptFor } from "../../dsh-craft/lib/mode.js"

const SAFETY = "不要改 harness 源码。不要调用 cursor_delegate。不要把密钥写进对话。用中文回复。"
const ASK_TOOLS = "问一问只读：可用 kb_search / kb_read / docs_list / workspace_glob / workspace_grep。不写盘、不发微信。不要用 Cursor 自带 grep/glob。"
const CRAFT_TOOLS = "做一做可写盘：用 MCP 的 office_word_write / office_excel_write / craft_task；检索用 kb_search / workspace_glob / workspace_grep（不要用 Cursor 自带 grep/glob）。成品写到 D:/dsh-workbench/docs（docx / xlsx / pdf），禁止只在对话里贴正文。"

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

export function loadCraftState() {
	try {
		const snap = JSON.parse(readFileSync("D:/dsh-workbench/craft/state.json", "utf8"))
		return {
			mode: snap.mode || "ask",
			expert: snap.expert || "none",
			planConfirmed: Boolean(snap.planConfirmed),
		}
	} catch {
		return { mode: "ask", expert: "none", planConfirmed: false }
	}
}

function toolHint(state) {
	if (state.mode === "craft") return CRAFT_TOOLS
	if (state.mode === "plan" && state.planConfirmed) return CRAFT_TOOLS
	return ASK_TOOLS
}

export function flattenRequest(options, extras = {}) {
	if (options.purpose === "session-title") {
		return "只输出一个很短的会话标题，不要解释。"
	}

	const state = extras.craft ?? loadCraftState()
	const modePrompt = promptFor(state)
	const hint = toolHint(state)
	const messages = options.messages ?? []
	if (extras.live) {
		const last = messages.at(-1)
		const body = messageText(last)
		return [`# ${last?.role || "user"}\n${body}`, modePrompt, hint, SAFETY].join("\n\n")
	}

	const parts = [
		"你是 DeepSeek Harness 网页里的助手。",
		modePrompt,
		hint,
		SAFETY,
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
