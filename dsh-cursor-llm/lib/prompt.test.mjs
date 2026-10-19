import { flattenRequest } from "./prompt.js"
import { promptFor } from "../../dsh-craft/lib/mode.js"

function fail(msg) {
	console.error("FAIL", msg)
	process.exit(1)
}

const askMode = promptFor({ mode: "ask", expert: "none" })
if (!askMode.includes("问一问") || !askMode.includes("不发微信")) fail("craft ask prompt must stay")
if (askMode.includes("office_word_write")) fail("ask mode prompt must not demand writing")

const craftOfficial = promptFor({ mode: "craft", expert: "official" })
if (!craftOfficial.includes("做一做") || !craftOfficial.includes("公文")) fail("craft official prompt must stay")
if (!craftOfficial.includes("文号") || !craftOfficial.includes("主送")) fail("公文 form must stay")

const ask = flattenRequest({
	system: "Use the read tool — not shell commands like cat — to inspect text files.",
	messages: [
		{ role: "user", content: [{ type: "text", text: "给我一份课表" }] },
	],
}, { craft: { mode: "ask", expert: "none" } })
if (ask.includes("Use the read tool")) fail("must not dump DSH system tool brief")
if (!ask.includes("给我一份课表")) fail("keeps user text")
if (!ask.includes("问一问")) fail("ask keeps 问一问")
if (!ask.includes("不发微信")) fail("ask keeps read-only")
if (ask.includes("office_word_write")) fail("ask must not tell it to write office files")
if (ask.includes("不要使用任何本地工具")) fail("must not ban read tools")
if (!ask.includes("kb_search")) fail("ask may read kb")
if (!ask.includes("cursor_delegate")) fail("still forbid cursor_delegate")

const craft = flattenRequest({
	messages: [
		{ role: "user", content: [{ type: "text", text: "调研报告发给我" }] },
	],
}, { craft: { mode: "craft", expert: "none" } })
if (!craft.includes("做一做")) fail("weixin/write uses 做一做")
if (craft.includes("当前工作档：问一问")) fail("craft must not use 问一问")
if (!craft.includes("office_word_write")) fail("craft names office_word_write")
if (!craft.includes("workspace_glob")) fail("craft names workspace_glob")

const official = flattenRequest({
	messages: [
		{ role: "user", content: [{ type: "text", text: "写通知" }] },
	],
}, { craft: { mode: "craft", expert: "official" } })
if (!official.includes("公文") || !official.includes("文号")) fail("公文 overlay stays")

const follow = flattenRequest({
	system: "Use the read tool",
	messages: [
		{ role: "user", content: [{ type: "text", text: "第一问" }] },
		{ role: "assistant", content: [{ type: "text", text: "第一答" }] },
		{ role: "user", content: [{ type: "text", text: "第二问" }] },
	],
}, { live: true, craft: { mode: "ask", expert: "none" } })
if (follow.includes("Use the read tool")) fail("follow-up must not resend system")
if (follow.includes("第一问") || follow.includes("第一答")) fail("follow-up only latest turn")
if (!follow.includes("第二问")) fail("follow-up keeps latest user")
if (!follow.includes("问一问")) fail("follow-up keeps 问一问")

const title = flattenRequest({ purpose: "session-title", messages: [{ role: "user", content: [{ type: "text", text: "长对话" }] }] })
if (!title.includes("会话标题")) fail("title purpose")

console.log("PASS cursor-prompt")
