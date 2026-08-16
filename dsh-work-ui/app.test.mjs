import { readFileSync } from "node:fs"

function fail(msg) {
	console.error("FAIL", msg)
	process.exit(1)
}

const html = readFileSync(new URL("./app.html", import.meta.url), "utf8")
if (!html.includes('id="app"')) fail("app root")
if (!html.includes('type="module"')) fail("module mount")
if (!html.includes("mount.js")) fail("mount.js")
if (html.includes("EventSource") || html.includes("location.reload")) fail("no live reload in shell")
if (!html.includes("react.production.min.js")) fail("react umd")
if (!html.includes("react-dom.production.min.js")) fail("react-dom umd")

const mount = readFileSync(new URL("./mount.js", import.meta.url), "utf8")
if (!mount.includes("keep-alive") && !mount.includes("KeepAlive") && !mount.includes("is-off")) {
	fail("mount must keep pages alive")
}

console.log("PASS app")
