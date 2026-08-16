import { shouldKeepListen } from "./tab-bridge.js"

function fail(msg) {
	console.error("FAIL", msg)
	process.exit(1)
}

if (!shouldKeepListen("信使")) fail("keep wx listen")
if (!shouldKeepListen("信使 · 黄山")) fail("keep listen prefix")
if (shouldKeepListen("知识库")) fail("inbox is not live listen")
if (shouldKeepListen("对话")) fail("chat is not live listen")

console.log("PASS tab-bridge")
