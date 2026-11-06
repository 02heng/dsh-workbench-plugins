import { translateSse } from "./translate.js"

function fail(msg, extra) {
	console.error("FAIL", msg, extra ?? "")
	process.exit(1)
}

async function* payloads() {
	yield JSON.stringify({ choices: [{ delta: { role: "assistant" } }] })
	yield JSON.stringify({ choices: [{ delta: { reasoning_content: "想" } }] })
	yield JSON.stringify({ choices: [{ delta: { reasoning_content: "一下" } }] })
	yield JSON.stringify({ choices: [{ delta: { content: "答" } }] })
	yield JSON.stringify({ choices: [{ delta: { content: "案" }, finish_reason: "stop" }] })
	yield "[DONE]"
}

const chunks = []
for await (const chunk of translateSse(payloads())) chunks.push(chunk)

const types = chunks.map((chunk) => chunk.type)
if (types[0] !== "block-start" || chunks[0].blockType !== "reasoning") fail("reasoning block first", chunks[0])
if (!types.includes("reasoning-delta") || !types.includes("text-delta")) fail("must emit both streams", types)
if (chunks.find((c) => c.type === "reasoning-delta" && c.text === "想") == null) fail("reasoning delta")
if (chunks.filter((c) => c.type === "text-delta").map((c) => c.text).join("") !== "答案") fail("text joined")
if (chunks.at(-1)?.type !== "finish") fail("finish last", chunks.at(-1))
if (chunks.filter((c) => c.type === "block-end").length !== 2) fail("two block ends")

async function* toolPayloads() {
	yield JSON.stringify({
		choices: [{
			delta: {
				tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: "bash", arguments: "" } }],
			},
		}],
	})
	yield JSON.stringify({
		choices: [{
			delta: { tool_calls: [{ index: 0, function: { arguments: "{\"command\":\"ls\"}" } }] },
			finish_reason: "tool_calls",
		}],
	})
	yield "[DONE]"
}

const toolChunks = []
for await (const chunk of translateSse(toolPayloads())) toolChunks.push(chunk)
if (toolChunks[0].blockType !== "tool-call") fail("tool block first", toolChunks[0])
const args = toolChunks.filter((c) => c.type === "tool-call-delta").map((c) => c.argumentsDelta).join("")
if (args !== "{\"command\":\"ls\"}") fail("tool args joined", args)
const ended = toolChunks.find((c) => c.type === "block-end")
if (ended?.block?.name !== "bash") fail("tool block end", ended)
if (toolChunks.at(-1)?.reason?.kind !== "tool-calls") fail("finish tool-calls", toolChunks.at(-1))

console.log("PASS deepseek-local-translate")
