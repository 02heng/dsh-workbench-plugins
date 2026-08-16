import { readFileSync } from "node:fs"

function fail(msg) {
	console.error("FAIL", msg)
	process.exit(1)
}

const src = readFileSync(new URL("./client.js", import.meta.url), "utf8")
if (src.includes("/plugins/dsh-messenger/desk")) {
	fail("messenger must not mount its own desk iframe")
}
console.log("PASS messenger-client")
