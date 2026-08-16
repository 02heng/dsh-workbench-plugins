import { createCursorAdapter, releaseSession } from "./adapter.js"

function fail(msg) {
	console.error("FAIL", msg)
	process.exit(1)
}

const created = []
const resumed = []
const sent = []
const waits = []
const disposes = []

function fakeRun() {
	return {
		supports(op) { return op === "stream" || op === "wait" || op === "cancel" },
		async * stream() {
			yield { type: "assistant", message: { content: [{ type: "text", text: "好" }] } }
		},
		async wait() {
			waits.push(1)
			return { status: "ok", result: "好" }
		},
	}
}

const FakeAgent = {
	async create(opts) {
		created.push(opts)
		return {
			agentId: "ag-1",
			async send(prompt) {
				sent.push(prompt)
				return fakeRun()
			},
			async [Symbol.asyncDispose]() { disposes.push("create") },
		}
	},
	async resume(id) {
		resumed.push(id)
		return {
			agentId: id,
			async send(prompt) {
				sent.push(prompt)
				return fakeRun()
			},
			async [Symbol.asyncDispose]() { disposes.push("resume") },
		}
	},
}

const adapter = await createCursorAdapter({
	apiKeyEnv: "CURSOR_API_KEY",
	model: "grok-4.6",
	resolveKey: async () => "test-key",
	Agent: FakeAgent,
})

async function drain(options) {
	const chunks = []
	for await (const ev of adapter.stream(options)) chunks.push(ev)
	return chunks
}

const req = {
	sessionId: "sess-1",
	cwd: "D:/dsh-workbench",
	model: "grok-4.6",
	messages: [{ role: "user", content: [{ type: "text", text: "你好" }] }],
}

await drain(req)
await drain({
	...req,
	messages: [
		{ role: "user", content: [{ type: "text", text: "你好" }] },
		{ role: "assistant", content: [{ type: "text", text: "好" }] },
		{ role: "user", content: [{ type: "text", text: "再问" }] },
	],
})

if (created.length !== 1) fail(`create once, got ${created.length}`)
if (resumed.length !== 0) fail("live agent must not resume")
if (sent.length !== 2) fail(`send twice, got ${sent.length}`)
if (waits.length !== 2) fail(`wait after each stream, got ${waits.length}`)
if (disposes.length !== 0) fail(`must keep agent, disposed ${disposes.length}`)
if (sent[1].includes("你好") && sent[1].includes("再问") === false) fail("second send should be follow-up")

await releaseSession("sess-1")
if (disposes.length !== 1) fail(`releaseSession disposes, got ${disposes.length}`)

console.log("PASS cursor-adapter")
