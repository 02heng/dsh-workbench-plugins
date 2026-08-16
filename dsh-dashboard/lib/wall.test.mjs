import { wallHtml } from "./wall.js"
import { workThemeCss } from "./theme.css.js"

function fail(msg) {
	console.error("FAIL", msg)
	process.exit(1)
}

if (!workThemeCss().includes(".paper-scroll")) fail("theme paper-scroll")
const html = wallHtml({
	school: { name: "测", campus: "东", term: "2026" },
	kpis: [],
	openTasks: [{ id: "t1", title: "巡检", every: "daily", tone: "ok", gap: "今日" }],
	devices: [],
	kb: { recent: [] },
	pendingDocs: [],
})
if (!html.includes("paper-scroll")) fail("wall lists must scroll in a fixed pane")
console.log("PASS wall")
