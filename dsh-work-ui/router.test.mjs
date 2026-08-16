import { parseHash, routeFromTab, tabFromPath } from "./router.js"

function fail(msg) {
	console.error("FAIL", msg)
	process.exit(1)
}

if (routeFromTab("信使").path !== "#/desk") fail("desk")
if (routeFromTab("记忆").path !== "#/atelier/memory") fail("memory")
if (routeFromTab("对话").path !== "") fail("chat stays in host")
if (routeFromTab("对话").name !== "host") fail("chat route name")
if (tabFromPath("#/board") !== "循环任务") fail("board tab")
if (parseHash("#/atelier/trail").page !== "trail") fail("trail page")
if (parseHash("#/desk").name !== "desk") fail("desk hash")
if (routeFromTab("知识库").path !== "#/inbox") fail("inbox")
if (routeFromTab("数据大屏").path !== "#/wall") fail("wall")
if (tabFromPath("#/atelier/todos") !== "待办") fail("todos tab")

console.log("PASS router")
