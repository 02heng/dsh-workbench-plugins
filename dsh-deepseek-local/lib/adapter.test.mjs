import { createLocalAdapter } from "./adapter.js"

function fail(msg, extra) {
	console.error("FAIL", msg, extra ?? "")
	process.exit(1)
}

function sseResponse(lines) {
	const enc = new TextEncoder()
	let i = 0
	const body = new ReadableStream({
		pull(controller) {
			if (i >= lines.length) {
				controller.close()
				return
			}
			controller.enqueue(enc.encode(`data: ${lines[i++]}\n\n`))
		},
	})
	return { ok: true, status: 200, statusText: "OK", body, async text() { return "" } }
}

const seen = []
const adapter = await createLocalAdapter({
	baseURL: "http://127.0.0.1:8765/v1",
	apiKeyEnv: "DEEPSEEK_LOCAL_API_KEY",
	resolveKey: async () => "sk-local",
	fetchImpl: async (url, init) => {
		seen.push({ url, init })
		return sseResponse([
			JSON.stringify({
				choices: [{
					delta: {
						tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: "bash", arguments: "{}" } }],
					},
					finish_reason: "tool_calls",
				}],
			}),
			"[DONE]",
		])
	},
})

const rows = await adapter.listModels("deepseek-local")
if (rows.map((row) => row.id).join(",") !== "deepseek-flash") fail("list models", rows)

const chunks = []
for await (const chunk of adapter.stream({
	provider: "deepseek-local",
	model: "deepseek-flash",
	messages: [{ role: "user", content: [{ type: "text", text: "列目录" }] }],
	tools: [{ name: "bash", description: "run", parameters: { type: "object", properties: {} } }],
})) chunks.push(chunk)

if (!seen[0].url.endsWith("/chat/completions")) fail("post completions", seen[0].url)
const body = JSON.parse(seen[0].init.body)
if (body.model !== "deepseek-flash") fail("model", body)
if (body.stream !== true) fail("must request stream", body)
if (body.thinking?.type !== "enabled") fail("official thinking object", body.thinking)
if (body.messages?.[0]?.content !== "列目录") fail("messages", body.messages)
if (body.tools?.[0]?.function?.name !== "bash") fail("forward tools", body.tools)
if (chunks.find((c) => c.type === "tool-call-delta")?.name !== "bash") fail("tool stream", chunks)
if (chunks.at(-1)?.reason?.kind !== "tool-calls") fail("finish", chunks.at(-1))

console.log("PASS deepseek-local-adapter")
