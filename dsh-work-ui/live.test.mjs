import { createLive } from "./live.js"

function fail(msg) {
	console.error("FAIL", msg)
	process.exit(1)
}

const quiet = createLive({ dirs: [], path: "/plugins/dsh-work-ui/live" })
if (quiet.snippet.includes("location.reload")) fail("default live must not reload the page")

const hot = createLive({ dirs: [], path: "/plugins/dsh-work-ui/live", reload: true })
if (!hot.snippet.includes("location.reload")) fail("reload:true keeps hot reload")

console.log("PASS live")
