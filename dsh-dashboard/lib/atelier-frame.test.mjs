import { readFileSync } from "node:fs"
import { beginAtelierShow, cancelAtelierShow, computeAtelierBox, isAtelierShowCurrent, isWelcomeLayout } from "./atelier-frame.js"
import { shouldHoldAtelier, unloadFrame } from "../../dsh-work-ui/lazy-tab.js"

function fail(msg, extra) {
	console.error("FAIL", msg, extra ?? "")
	process.exit(1)
}

const view = { top: 88, left: 260, width: 1100, height: 720, right: 1360, bottom: 808 }
const box = computeAtelierBox({ view, viewport: { width: 1440, height: 900 } })

if (box.width < 800 || box.height < 400) {
	fail("atelier frame must fill the main view, not the 300x150 iframe default", box)
}
if (box.left < 200) {
	fail("atelier frame must start after the workspace rail, not over it", box)
}
if (box.top < 70) {
	fail("atelier frame must sit below the session header", box)
}

const fallback = computeAtelierBox({
	header: { bottom: 96 },
	aside: { right: 248 },
	viewport: { width: 1440, height: 900 },
})
if (fallback.left !== 248 || fallback.width !== 1440 - 248 || fallback.height !== 900 - 96) {
	fail("fallback must use explicit width/height from viewport minus chrome", fallback)
}

const bleed = computeAtelierBox({
	view: { top: 88, left: 0, width: 1440, height: 812, right: 1440, bottom: 900 },
	aside: { right: 248 },
	composer: { top: 760 },
	viewport: { width: 1440, height: 900 },
})
if (!isWelcomeLayout({ composer: { top: 420 } })) fail("a new conversation without a view must count as welcome")
if (isWelcomeLayout({ view: { width: 900, height: 600 }, composer: { top: 760 } })) {
	fail("an open session view must keep the atelier frame")
}
if (bleed.left < 248) fail("full-bleed view must not cover the workspace rail", bleed)
if (bleed.top + bleed.height > 760) fail("atelier frame must stop above the composer", bleed)

if (shouldHoldAtelier("循环任务") || shouldHoldAtelier("信使") || shouldHoldAtelier("对话")) {
	fail("atelier frame must unload when the selected tab is not an atelier page")
}
const held = { src: "/plugins/dsh-dashboard/atelier?page=todos", dataset: { page: "todos", session: "s" } }
unloadFrame(held)
if (held.src !== "about:blank" || held.dataset.page) {
	fail("leaving atelier must blank the iframe src", held)
}

const stale = beginAtelierShow()
cancelAtelierShow()
if (isAtelierShowCurrent(stale)) fail("cancelled atelier show must not apply after leaving the tab")
const fresh = beginAtelierShow()
if (!isAtelierShowCurrent(fresh)) fail("latest atelier show stays current")

const client = readFileSync(new URL("./client.js", import.meta.url), "utf8")
if (client.includes("dsh-atelier-frame") || client.includes("data-atelier")) {
	fail("dashboard client must not keep the old atelier overlay")
}
if (!client.includes("dsh-work-frame") || !client.includes("/plugins/dsh-dashboard/atelier")) {
	fail("dashboard client must show atelier pages from the existing atelier route")
}
if (client.includes('frame.src = "about:blank"') || client.includes("frame.src=\"about:blank\"")) {
	fail("leaving a paper tab must hide the work-frame, not blank it")
}
if (!client.includes("showGen")) {
	fail("dashboard client must drop in-flight work-frame show when opening 对话")
}
if (/function showWork[\s\S]*?setDrawer\(true\)/.test(client) || /function showAtelier[\s\S]*?setDrawer\(true\)/.test(client)) {
	fail("opening the workbench must not fold the chat composer")
}
const atelierSrc = readFileSync(new URL("./atelier.js", import.meta.url), "utf8")
if (!atelierSrc.includes("paper-scroll")) {
	fail("atelier lists must use paper-scroll")
}
if (!atelierSrc.includes("/memory-evolve/api/memory/update")) {
	fail("memory ledger must save in-place edits")
}
if (!atelierSrc.includes("改写") || !atelierSrc.includes("保存")) {
	fail("memory entries must expose 改写 and 保存")
}

console.log("ok")
