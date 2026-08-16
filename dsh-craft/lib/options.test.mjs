import { pickOption, recordOptions } from "./options.js"

function assert(cond, msg) {
	if (!cond) throw new Error(msg)
}

try { recordOptions("周报", [{ title: "只一个" }]); throw new Error("one") } catch (e) {
	if (e.message === "one") throw e
}

const rec = recordOptions("周报", [
	{ title: "短讯", summary: "一页要点" },
	{ title: "台账", summary: "表格加口径" },
	{ title: "公文", summary: "正式函" },
])
assert(rec.options.length === 3, "three")
assert(rec.picked == null, "unpicked")
assert(rec.brief === "周报", "brief")

const picked = pickOption(rec, 1)
assert(picked.picked === 1, "pick 1")
assert(picked.options[1].title === "台账", "title")
try { pickOption(rec, 9); throw new Error("oob") } catch (e) {
	if (e.message === "oob") throw e
}

console.log("PASS options")
