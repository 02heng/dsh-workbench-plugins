import { registerWorkUi } from "./http.js"

function fail(msg) {
	console.error("FAIL", msg)
	process.exit(1)
}

const routes = []
registerWorkUi({
	register(route) {
		routes.push(route)
		return () => {}
	},
})

if (!routes.some((route) => route.kind === "exact" && route.path === "/plugins/dsh-work-ui/app")) {
	fail("must register exact /plugins/dsh-work-ui/app")
}
if (!routes.some((route) => route.path === "/plugins/dsh-work-ui/mount.js")) {
	fail("must register mount.js")
}
if (!routes.some((route) => route.path === "/plugins/dsh-work-ui/theme.css")) {
	fail("must register theme.css")
}

console.log("PASS work-ui-http")
