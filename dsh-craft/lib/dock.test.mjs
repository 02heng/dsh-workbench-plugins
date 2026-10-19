import { shouldShowCraftDock } from "./dock.js"

function fail(msg) {
	console.error("FAIL", msg)
	process.exit(1)
}

if (!shouldShowCraftDock("对话")) fail("show on 对话")
if (shouldShowCraftDock("技能")) fail("hide on 技能")
if (shouldShowCraftDock("记忆")) fail("hide on 记忆")
if (shouldShowCraftDock("信使")) fail("hide on 信使")
if (shouldShowCraftDock("书籍转技能")) fail("hide on atelier")
if (!shouldShowCraftDock("对话 ×")) fail("clean close mark still 对话")
if (!shouldShowCraftDock("文件")) fail("right-side 文件 tab must not hide chips")
if (!shouldShowCraftDock("")) fail("empty tab fail-open")
if (!shouldShowCraftDock("未知页")) fail("unknown tab fail-open")

console.log("PASS craft-dock")
