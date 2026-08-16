import { computeTabShelfBox } from "./vue-tabs.js"

function fail(msg, extra) {
	console.error("FAIL", msg, extra ?? "")
	process.exit(1)
}

if (computeTabShelfBox(null) !== null) fail("null header must hide the shelf")

const hidden = computeTabShelfBox({
	left: 0, bottom: 0, width: 0, height: 0, display: "none", ariaHidden: true,
})
if (hidden !== null) fail("blank-workspace hidden header must hide the shelf", hidden)

const collapsed = computeTabShelfBox({ left: 0, bottom: 0, width: 0, height: 0 })
if (collapsed !== null) fail("0×0 header must hide the shelf", collapsed)

const rail = computeTabShelfBox({ left: 0, bottom: 40, width: 120, height: 36 })
if (rail !== null) fail("shelf must not park on the 56px sidebar rail", rail)

const ready = computeTabShelfBox({ left: 260, bottom: 88, width: 900, height: 48 })
if (!ready || ready.left !== 260 || ready.width !== 900 || ready.top !== 58) {
	fail("visible conversation header must pin the shelf under the chrome", ready)
}

console.log("PASS place-host")
