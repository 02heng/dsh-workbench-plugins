import { routeChat } from "./route.js"

function fail(msg, extra) {
	console.error("FAIL", msg, extra ?? "")
	process.exit(1)
}

const cursor = { provider: "cursor", model: "grok-4.6" }

const workDeepseek = routeChat(
	{ provider: "deepseek-official", model: "deepseek-v4-flash", reasoningEffort: "max" },
	{ agentPreset: "work" },
	cursor,
)
if (workDeepseek.provider !== "cursor" || workDeepseek.model !== "grok-4.6") {
	fail("work preset must leave DeepSeek", workDeepseek)
}
if (workDeepseek.reasoningEffort !== undefined) {
	fail("cursor route must drop DeepSeek reasoningEffort", workDeepseek)
}

const defaultDeepseek = routeChat(
	{ provider: "deepseek-official", model: "deepseek-v4-flash" },
	{},
	cursor,
)
if (defaultDeepseek.provider !== "cursor" || defaultDeepseek.model !== "grok-4.6") {
	fail("default chat must leave DeepSeek", defaultDeepseek)
}

const already = routeChat(
	{ provider: "cursor", model: "composer-2.5" },
	{ agentPreset: "cursor" },
	cursor,
)
if (already.provider !== "cursor" || already.model !== "composer-2.5") {
	fail("keep explicit Cursor model", already)
}

console.log("PASS cursor-llm-route")
