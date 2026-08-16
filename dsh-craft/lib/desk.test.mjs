import { deskHtml } from "./desk.js"

function fail(msg) {
	console.error("FAIL", msg)
	process.exit(1)
}

const html = deskHtml({
	mode: "plan",
	expert: "thesis",
	cards: [{ id: "T-0816-01", text: "任务: 周报", weixin: "已回图", files: ["D:/dsh-workbench/docs/周报.docx"], title: "微信" }],
	goals: [{ id: "G-1", title: "课题预审", done: false }],
	options: { brief: "周报", picked: null, options: [{ title: "短讯", summary: "一页" }, { title: "台账", summary: "表格" }] },
	reviews: [{ path: "D:/a.md", issues: ["文号空着"], rewritten: false }],
	docs: [{ path: "D:/dsh-kb/notes/a.md", title: "预审", body: "正文" }],
})

if (!html.includes("问一问") || !html.includes("想一想") || !html.includes("做一做")) fail("modes")
if (!html.includes("课题预审") || !html.includes("公文")) fail("experts")
if (!html.includes("T-0816-01") || !html.includes("周报.docx")) fail("task card")
if (!html.includes("短讯") || !html.includes("台账")) fail("options")
if (!html.includes("文号空着")) fail("review")
if (html.includes('type="file"') && html.includes("选择文件")) fail("native file")
if (!html.includes("确认删除") && !html.includes("data-act=\"del\"")) fail("two-step delete")
if (!html.includes("toast")) fail("toast")
console.log("PASS desk")
