import { flattenRequest } from "./prompt.js"

function fail(msg) {
	console.error("FAIL", msg)
	process.exit(1)
}

const first = flattenRequest({
	system: "Use the read tool — not shell commands like cat — to inspect text files.",
	messages: [
		{ role: "user", content: [{ type: "text", text: "给我一份课表" }] },
	],
})
if (first.includes("Use the read tool")) fail("must not dump DSH system tool brief")
if (!first.includes("给我一份课表")) fail("keeps user text")
if (!first.includes("只回答") && !first.includes("不要自己")) fail("chat-only rule")
if (first.includes("直接在当前工作区") || first.includes("直接改文件")) {
	fail("must not tell local agent to edit/run/test")
}

const follow = flattenRequest({
	system: "Use the read tool",
	messages: [
		{ role: "user", content: [{ type: "text", text: "第一问" }] },
		{ role: "assistant", content: [{ type: "text", text: "第一答" }] },
		{ role: "user", content: [{ type: "text", text: "第二问" }] },
	],
}, { live: true })
if (follow.includes("Use the read tool")) fail("follow-up must not resend system")
if (follow.includes("第一问") || follow.includes("第一答")) fail("follow-up only latest turn")
if (!follow.includes("第二问")) fail("follow-up keeps latest user")

const title = flattenRequest({ purpose: "session-title", messages: [{ role: "user", content: [{ type: "text", text: "长对话" }] }] })
if (!title.includes("会话标题")) fail("title purpose")

console.log("PASS cursor-prompt")
