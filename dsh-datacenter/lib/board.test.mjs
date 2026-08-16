import { boardHtml } from "./board.js"
import { workThemeCss } from "./theme.css.js"

function fail(msg) {
	console.error("FAIL", msg)
	process.exit(1)
}

if (!workThemeCss().includes(".paper-scroll")) fail("theme paper-scroll")
const html = boardHtml({
	tags: [],
	tasks: [{ id: "t1", title: "打卡", kind: "checkin", enabled: true, every: "daily", at: "08:30" }],
	devices: [],
	checkins: [{ at: "08:30", title: "打卡" }],
	duty: { message: "" },
})
if (!html.includes("paper-scroll")) fail("board tables must scroll in a fixed pane")
console.log("PASS board")
