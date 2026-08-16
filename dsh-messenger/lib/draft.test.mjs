import { draftBody } from "./draft.js"

function fail(msg) {
	console.error("FAIL", msg)
	process.exit(1)
}

try {
	await draftBody({ to: "a@example.com", subject: "事", notes: "改到周三" }, {
		env: {},
		fetch: async () => ({ ok: true, json: async () => ({}) }),
	})
	fail("missing key should throw")
} catch (error) {
	if (!String(error?.message ?? error).includes("未配置 DEEPSEEK_API_KEY")) {
		fail("missing key message")
	}
}

const inboxDump = "整箱邮件如下：" + JSON.stringify([
	{ from: "one@example.com", subject: "旧信一", body: "不该出现在起草请求里的收件箱全文甲" },
	{ from: "two@example.com", subject: "旧信二", body: "不该出现在起草请求里的收件箱全文乙" },
])

const calls = []
async function fakeFetch(url, init = {}) {
	calls.push({ href: String(url), body: String(init.body ?? "") })
	return {
		ok: true,
		status: 200,
		json: async () => ({
			choices: [{ message: { content: "您好，周三改期，请回复是否方便。" } }],
		}),
		text: async () => "",
	}
}

const result = await draftBody(
	{ to: "dest@example.com", subject: "改期", notes: "改到周三下午" },
	{ env: { DEEPSEEK_API_KEY: "test-key" }, fetch: fakeFetch },
)

if (result?.body !== "您好，周三改期，请回复是否方便。") {
	fail("draft body")
}

if (calls.length !== 1 || !calls[0].href.includes("https://api.deepseek.com/chat/completions")) {
	fail("draft endpoint")
}

const payload = JSON.parse(calls[0].body)
if (payload.model !== "deepseek-chat") fail("model")
const system = payload.messages?.find((row) => row.role === "system")
const user = payload.messages?.find((row) => row.role === "user")
if (!system?.content?.includes("你写中文邮件正文，不要主题行，不要假装已发送。")) {
	fail("system prompt")
}
if (!String(user?.content ?? "").includes("dest@example.com") || !String(user.content).includes("改期") || !String(user.content).includes("改到周三下午")) {
	fail("user fields")
}
if (calls[0].body.includes("整箱") || calls[0].body.includes("旧信") || calls[0].body.includes(inboxDump.slice(0, 12))) {
	fail("request contained inbox dump")
}

console.log("PASS draft")
