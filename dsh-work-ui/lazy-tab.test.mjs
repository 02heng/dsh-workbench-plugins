import { atelierPageOf, isLiveListenTab, shouldHoldAtelier, shouldLoadPluginView, unloadFrame } from "./lazy-tab.js"

function fail(msg) {
	console.error("FAIL", msg)
	process.exit(1)
}

if (atelierPageOf("记忆") !== "memory") fail("atelier 记忆")
if (atelierPageOf("书籍转技能") !== "book") fail("atelier book")
if (atelierPageOf("信使")) fail("信使 is not atelier")
if (!isLiveListenTab("信使")) fail("live listen 信使")
if (isLiveListenTab("知识库")) fail("知识库 is not live listen")
if (!shouldHoldAtelier("待办")) fail("hold atelier 待办")
if (shouldHoldAtelier("循环任务")) fail("do not hold atelier on 循环任务")
if (shouldHoldAtelier("信使")) fail("do not hold atelier on 信使")
if (!shouldLoadPluginView("知识库", "知识库")) fail("load selected 知识库")
if (shouldLoadPluginView("对话", "知识库")) fail("do not load 知识库 when 对话")
if (shouldLoadPluginView("信使", "循环任务")) fail("do not load 循环任务 when 信使")

const frame = { src: "/plugins/dsh-dashboard/atelier?page=memory", dataset: { page: "memory", session: "s1" } }
const cleared = unloadFrame(frame)
if (cleared.src !== "about:blank" || frame.dataset.page !== "" || frame.dataset.session !== "") {
	fail("unload atelier frame " + JSON.stringify(cleared))
}

console.log("PASS lazy-tab")
