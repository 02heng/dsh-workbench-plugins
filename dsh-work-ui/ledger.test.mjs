import { itemsFingerprint } from "./ledger.js"

function fail(msg) {
	console.error("FAIL", msg)
	process.exit(1)
}

const a = [{ id: "T-1", status: "queued", title: "x", text: "任务: 写", at: "t", action: "dispatch" }]
const b = [{ id: "T-1", status: "queued", title: "x", text: "任务: 写", at: "t", action: "dispatch" }]
const c = [{ id: "T-1", status: "replied", title: "x", text: "任务: 写", at: "t", action: "dispatch" }]
if (itemsFingerprint(a) !== itemsFingerprint(b)) fail("same items same fingerprint")
if (itemsFingerprint(a) === itemsFingerprint(c)) fail("status change must change fingerprint")

console.log("PASS ledger")
