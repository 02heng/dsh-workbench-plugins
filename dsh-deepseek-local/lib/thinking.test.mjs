import { thinkingPayload, wantThinking } from "./thinking.js"

function fail(msg, extra) {
	console.error("FAIL", msg, extra ?? "")
	process.exit(1)
}

if (wantThinking("deepseek-flash") !== true) fail("official default thinks")
if (wantThinking("deepseek-flash", "high") !== true) fail("high thinks")
if (wantThinking("deepseek-flash", "off") !== false) fail("off does not think")
if (wantThinking("flash", "disabled") !== false) fail("disabled does not think")
if (JSON.stringify(thinkingPayload("deepseek-flash", "high")) !== '{"type":"enabled"}') {
	fail("official thinking payload", thinkingPayload("deepseek-flash", "high"))
}
if (JSON.stringify(thinkingPayload("deepseek-flash", "off")) !== '{"type":"disabled"}') {
	fail("official thinking off payload", thinkingPayload("deepseek-flash", "off"))
}

console.log("PASS deepseek-local-thinking")
