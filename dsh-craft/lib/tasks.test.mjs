import { attachFiles, taskCard, weixinLabel } from "./tasks.js"

function assert(cond, msg) {
	if (!cond) throw new Error(msg)
}

const item = {
	id: "T-0816-01",
	text: "任务: 写周报",
	prompt: "写周报",
	title: "微信·黄山·T-0816-01",
	sessionId: "sess-1",
	status: "replied",
	at: "2026-08-16T08:00:00.000Z",
}

const card = taskCard(item)
assert(card.id === "T-0816-01", "id")
assert(card.text.includes("周报"), "text")
assert(card.sessionId === "sess-1", "session")
assert(card.files.length === 0, "no files")
assert(card.weixin === "已回图", card.weixin)

const withFiles = attachFiles(item, [
	"D:/dsh-workbench/docs/周报.docx",
	"D:/dsh-workbench/docs/周报.docx",
	"C:/secret.docx",
])
assert(withFiles.files.length === 1, "dedupe + skip C")
assert(withFiles.files[0].includes("周报.docx"), "keep D")

const card2 = taskCard(withFiles)
assert(card2.files.length === 1, "card files")
assert(weixinLabel("queued") === "排队", "queued")
assert(weixinLabel("running") === "在跑", "running")

console.log("PASS tasks")
