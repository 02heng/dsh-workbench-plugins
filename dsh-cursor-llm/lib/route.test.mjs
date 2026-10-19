import { routeChat } from "./route.js"

function fail(msg, extra) {
	console.error("FAIL", msg, extra ?? "")
	process.exit(1)
}

const cursor = { provider: "cursor", model: "grok-4.6" }
const deepseek = { provider: "deepseek-official", model: "deepseek-v4-flash", reasoningEffort: "max" }

const pickedDeepseek = routeChat(deepseek, {}, cursor)
if (pickedDeepseek.provider !== "deepseek-official" || pickedDeepseek.model !== "deepseek-v4-flash") {
	fail("user-selected DeepSeek must not be rewritten", pickedDeepseek)
}
if (pickedDeepseek.reasoningEffort !== "max") {
	fail("user-selected reasoningEffort must stay", pickedDeepseek)
}

const workDeepseek = routeChat(deepseek, { agentPreset: "work" }, cursor)
if (workDeepseek.provider !== "deepseek-official" || workDeepseek.model !== "deepseek-v4-flash") {
	fail("work preset keeps whatever the user/session selected", workDeepseek)
}

const weixinCursor = routeChat(
	{ provider: "cursor", model: "grok-4.6" },
	{ title: "微信·黄山·T-0817-06", agentPreset: "work" },
	cursor,
)
if (weixinCursor.provider !== "cursor" || weixinCursor.model !== "grok-4.6") {
	fail("weixin session can still use Cursor if that is selected", weixinCursor)
}

const already = routeChat(
	{ provider: "cursor", model: "composer-2.5" },
	{ agentPreset: "cursor" },
	cursor,
)
if (already.provider !== "cursor" || already.model !== "composer-2.5") {
	fail("keep explicit Cursor model", already)
}

const missing = routeChat({}, {}, cursor)
if (missing.provider !== "cursor" || missing.model !== "grok-4.6") {
	fail("only fill Cursor when nothing is selected", missing)
}

console.log("PASS cursor-llm-route")
