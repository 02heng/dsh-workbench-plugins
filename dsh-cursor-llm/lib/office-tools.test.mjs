import { access, rm } from "node:fs/promises"
import { officeCustomTools } from "./office-tools.js"

const cwd = "D:/dsh-workbench"
const path = "D:/dsh-workbench/docs/_cursor-llm-office-test.docx"
await rm(path, { force: true })
const tools = officeCustomTools(cwd)
const result = await tools.office_word_write.execute({
	path,
	title: "试写",
	body: "第一段\n\n第二段",
})
if (!String(result.path || "").endsWith("_cursor-llm-office-test.docx")) {
	console.error("FAIL write path", result)
	process.exit(1)
}
await access(path)
await rm(path, { force: true })
try {
	await tools.office_word_write.execute({ path: "C:/Windows/bad.docx", body: "x" })
	console.error("FAIL must refuse C drive")
	process.exit(1)
} catch (error) {
	if (!String(error.message).includes("工作区")) {
		console.error("FAIL refuse text", error)
		process.exit(1)
	}
}
const kb = await tools.kb_search.execute({ query: "平谷" })
if (!Array.isArray(kb.hits) || !kb.hits.some((hit) => String(hit.path || hit.title || "").includes("平谷"))) {
	console.error("FAIL kb_search 平谷", kb)
	process.exit(1)
}
const listed = await tools.docs_list.execute({})
if (!listed.root || !String(listed.root).includes("docs")) {
	console.error("FAIL docs_list", listed)
	process.exit(1)
}
const globbed = await tools.workspace_glob.execute({ pattern: "**/*.md", root: "D:/dsh-kb" })
if (!Array.isArray(globbed.files) || !globbed.files.some((p) => String(p).includes("平谷"))) {
	console.error("FAIL workspace_glob", globbed)
	process.exit(1)
}
const grepped = await tools.workspace_grep.execute({ query: "学科安排", root: "D:/dsh-kb" })
if (!Array.isArray(grepped.hits) || grepped.hits.length === 0) {
	console.error("FAIL workspace_grep", grepped)
	process.exit(1)
}
const searched = await tools.craft_search.execute({ query: "平谷" })
if (!Array.isArray(searched.hits) || searched.hits.length === 0) {
	console.error("FAIL craft_search", searched)
	process.exit(1)
}
console.log("PASS cursor-office-tools")
