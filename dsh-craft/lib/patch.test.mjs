import { applySelection, excerpt, pendingPatch } from "./patch.js"

function assert(cond, msg) {
	if (!cond) throw new Error(msg)
}

const text = "第一段。\n第二段要改。\n第三段。"
const start = text.indexOf("第二段")
const end = start + "第二段要改。".length
assert(excerpt(text, start, end) === "第二段要改。", "excerpt")
const next = applySelection(text, start, end, "第二段已改成调研口径。")
assert(next.includes("第一段"), "keep head")
assert(next.includes("调研口径"), "replaced")
assert(next.includes("第三段"), "keep tail")
assert(!next.includes("第二段要改"), "old gone")

try { applySelection(text, -1, 2, "x"); throw new Error("neg") } catch (e) {
	if (e.message === "neg") throw e
}
try { applySelection(text, 2, 2, "x"); throw new Error("empty") } catch (e) {
	if (e.message === "empty") throw e
}

const pending = pendingPatch({
	path: "D:/dsh-kb/notes/周报.md",
	text,
	start,
	end,
	instruction: "改成调研口径",
})
assert(pending.excerpt === "第二段要改。", "pending excerpt")
assert(pending.instruction.includes("调研"), "instruction")
assert(pending.path.startsWith("D:/"), "D path")
try {
	pendingPatch({ path: "C:/x.md", text, start, end, instruction: "改" })
	throw new Error("c drive")
} catch (e) {
	if (e.message === "c drive") throw e
}

console.log("PASS patch")
