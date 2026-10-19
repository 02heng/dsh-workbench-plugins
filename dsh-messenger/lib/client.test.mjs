import { readFileSync } from "node:fs"

function fail(msg) {
	console.error("FAIL", msg)
	process.exit(1)
}

const src = readFileSync(new URL("./client.js", import.meta.url), "utf8")
if (src.includes("minHeight: 0") || src.includes('minHeight: "0"')) {
	fail("messenger iframe must keep a visible min-height so the desk does not collapse")
}
if (!src.includes("/plugins/dsh-messenger/desk")) {
	fail("messenger must mount the desk iframe so the tab is not empty")
}
if (!src.includes("72vh") && !src.includes("640px") && !src.includes("min(72vh")) {
	fail("messenger iframe needs a fallback height inside conversation.view")
}
console.log("PASS messenger-client")
