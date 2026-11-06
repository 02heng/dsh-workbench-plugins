import { toOpenAiMessages, toOpenAiTools } from "./messages.js"

function fail(msg, extra) {
	console.error("FAIL", msg, extra ?? "")
	process.exit(1)
}

const messages = toOpenAiMessages({
	system: "系统",
	messages: [
		{ role: "user", content: [{ type: "text", text: "你好" }] },
		{ role: "assistant", content: [{ type: "reasoning", text: "内部想" }, { type: "text", text: "好" }] },
		{ role: "user", content: [{ type: "image", url: "data:image/png;base64,AA==" }, { type: "text", text: "这是什么" }] },
	],
})

if (messages[0].role !== "system" || messages[0].content !== "系统") fail("system first", messages[0])
if (messages[1].content !== "你好") fail("user text", messages[1])
if (messages[2].content !== "好") fail("assistant text only", messages[2])
if (messages[2].reasoning_content !== "内部想") fail("official reasoning_content", messages[2])
const vision = messages[3]
if (!Array.isArray(vision.content)) fail("vision uses multipart", vision)
if (!vision.content.some((part) => part.type === "text" && part.text === "这是什么")) fail("vision text", vision)
if (!vision.content.some((part) => part.type === "image_url" && String(part.image_url?.url).startsWith("data:"))) {
	fail("vision image_url", vision)
}

const tools = toOpenAiTools([{ name: "bash", description: "run", parameters: { type: "object", properties: {} } }])
if (tools[0].type !== "function" || tools[0].function.name !== "bash") fail("official tools", tools)

const toolTurn = toOpenAiMessages({
	messages: [
		{
			role: "assistant",
			content: [{ type: "tool-call", id: "call_1", name: "bash", arguments: "{\"command\":\"ls\"}" }],
		},
		{
			role: "user",
			content: [{ type: "tool-result", toolCallId: "call_1", content: [{ type: "text", text: "a.py" }] }],
		},
	],
})
if (toolTurn[0].tool_calls?.[0]?.function?.name !== "bash") fail("assistant tool_calls", toolTurn[0])
if (toolTurn[1].role !== "tool" || toolTurn[1].tool_call_id !== "call_1") fail("tool result role", toolTurn[1])
if (toolTurn[1].content !== "a.py") fail("tool result text", toolTurn[1])

console.log("PASS deepseek-local-messages")
