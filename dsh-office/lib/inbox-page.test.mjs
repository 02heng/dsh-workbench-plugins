import { inboxHtml } from "./inbox-page.js"
import { workThemeCss } from "./theme.css.js"

function fail(msg) {
	console.error("FAIL", msg)
	process.exit(1)
}

const css = workThemeCss()
if (!css.includes(".paper-scroll") || !css.includes("overflow-y:auto")) fail("theme paper-scroll")

const html = inboxHtml({
	docs: [{ id: "d1", name: "方案.docx", kind: "docx", uploadedAt: "2026-08-16T04:54:38.000Z", chars: 12, toKb: false }],
})
if (!html.includes("paper-scroll")) fail("inbox table must scroll in a fixed pane")
console.log("PASS inbox-page")
