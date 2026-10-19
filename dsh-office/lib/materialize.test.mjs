import { mkdir, rm, stat } from "node:fs/promises"
import { join } from "node:path"
import {
	hasOfficeWriteCall,
	inferKind,
	lastRoleText,
	markdownTables,
	materializeFromTurn,
	parseOfficeFence,
	wantsDocument,
} from "./materialize.js"

if (!wantsDocument("弄一个顺义区事业编的汇总")) {
	console.error("FAIL wants 汇总")
	process.exit(1)
}
if (wantsDocument("今天天气")) {
	console.error("FAIL idle chat")
	process.exit(1)
}

const table = `| 单位 | 人数 |\n| --- | --- |\n| 教委 | 12 |\n| 卫健 | 8 |`
if (markdownTables(table).length !== 1 || markdownTables(table)[0][1][0] !== "教委") {
	console.error("FAIL tables", markdownTables(table))
	process.exit(1)
}
if (inferKind("做个课表", "随便") !== "excel") {
	console.error("FAIL infer excel")
	process.exit(1)
}
if (inferKind("做课件", "## 一\n- a") !== "ppt") {
	console.error("FAIL infer ppt")
	process.exit(1)
}
if (inferKind("写通知", "正文") !== "word") {
	console.error("FAIL infer word")
	process.exit(1)
}

const fenced = parseOfficeFence('前文\n```office\n{"kind":"word","title":"通知","body":"第一段\\n\\n第二段"}\n```')
if (!fenced || fenced.kind !== "word" || fenced.title !== "通知") {
	console.error("FAIL fence", fenced)
	process.exit(1)
}

const session = {
	deriveMessages() {
		return [
			{ role: "user", content: [{ type: "text", text: "写一份通知" }] },
			{ role: "assistant", content: [{ type: "text", text: "关于开展期末检查的通知\n\n请各校按期报送。" }] },
		]
	},
}
if (lastRoleText(session, "assistant").includes("期末检查") !== true) {
	console.error("FAIL last assistant")
	process.exit(1)
}
if (hasOfficeWriteCall(session)) {
	console.error("FAIL no write yet")
	process.exit(1)
}
if (!hasOfficeWriteCall({
	messages: [{
		role: "assistant",
		content: [{ type: "tool-call", name: "office_word_write", arguments: "{}" }],
	}],
})) {
	console.error("FAIL detect write")
	process.exit(1)
}

const root = "D:/dsh-workbench/docs/_test-materialize"
await rm(root, { recursive: true, force: true })
await mkdir(root, { recursive: true })

const word = await materializeFromTurn({
	userText: "写一份通知",
	assistantText: "关于开展期末教学检查的通知\n\n请各校于本周五前报送材料，逾期视为未完成。",
	destDir: root,
	basename: "T-test-word",
	title: "期末检查通知",
})
if (!word?.path?.endsWith(".docx") || !(await stat(word.path)).size) {
	console.error("FAIL word", word)
	process.exit(1)
}

const excel = await materializeFromTurn({
	userText: "做个名册",
	assistantText: table,
	destDir: root,
	basename: "T-test-xls",
})
if (!excel?.path?.endsWith(".xlsx") || !(await stat(excel.path)).size) {
	console.error("FAIL excel", excel)
	process.exit(1)
}

const ppt = await materializeFromTurn({
	userText: "做课件",
	assistantText: "## 目标\n- 懂流程\n## 步骤\n- 先收材料",
	destDir: root,
	basename: "T-test-ppt",
	title: "期末检查",
})
if (!ppt?.path?.endsWith(".pptx") || !(await stat(ppt.path)).size) {
	console.error("FAIL ppt", ppt)
	process.exit(1)
}

const skipped = await materializeFromTurn({
	assistantText: "好的",
	destDir: root,
	basename: "skip",
})
if (skipped) {
	console.error("FAIL skip short", skipped)
	process.exit(1)
}

await rm(root, { recursive: true, force: true })
console.log("PASS materialize")
