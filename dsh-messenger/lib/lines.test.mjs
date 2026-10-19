import { applyPromptTemplate, findLineByName, normalizeLines, prefixesOf } from "./lines.js"

function eq(a, b, msg) {
	if (JSON.stringify(a) !== JSON.stringify(b)) {
		console.error("FAIL", msg, a, b)
		process.exit(1)
	}
}

eq(prefixesOf("任务:").includes("任务"), false, "colon token does not match 任务清单")
eq(prefixesOf("补齐").includes("补齐"), true, "bare token matches")
eq(applyPromptTemplate("把{{input}}写成公文", "要点"), "把要点写成公文", "template")
eq(applyPromptTemplate("固定稿", "补充"), "固定稿\n\n补充", "append")

const migrated = normalizeLines({ contact: "黄山", password: "补齐", listen: true })
eq(migrated.lines[0].name, "黄山", "migrate name")
eq(migrated.lines[0].passwords[0].token, "补齐", "migrate token")
eq(migrated.contact, "黄山", "derived contact")

const two = normalizeLines({
	lines: [
		{ id: "line-1", name: "黄山", passwords: [{ id: "pw-1", token: "任务:", prompt: "{{input}}" }] },
		{ id: "line-2", name: "张三", passwords: [{ id: "pw-2", token: "补齐", prompt: "请补齐：{{input}}" }] },
	],
	activeLineId: "line-2",
})
eq(two.contact, "张三", "active contact")
eq(findLineByName(two, "张三")?.id, "line-2", "find 张三")
eq(findLineByName(two, "路人"), null, "unknown")

console.log("PASS lines")
