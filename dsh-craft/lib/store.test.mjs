import { mkdir, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { createCraftStore, mergeTaskCards, searchRoots } from "./store.js"

const root = "D:/dsh-workbench/craft/_test-store"
await rm(root, { recursive: true, force: true })

const store = createCraftStore(root)
await store.setMode("ask")
let snap = await store.snapshot()
if (snap.mode !== "ask") throw new Error("mode")
if (!snap.prompt.includes("问一问")) throw new Error("prompt")

await store.setMode("craft", { channel: "weixin" })
snap = await store.snapshot()
if (snap.mode !== "craft") throw new Error("weixin craft")

await store.setMode("plan")
await store.putOptions("周报", [
	{ title: "短讯", summary: "一页" },
	{ title: "台账", summary: "表格" },
])
try {
	await store.confirmPlan()
	throw new Error("confirm too soon")
} catch (e) {
	if (e.message === "confirm too soon") throw e
}
await store.chooseOption(0)
snap = await store.snapshot()
if (!snap.planConfirmed || snap.options.picked !== 0) throw new Error("picked")
if (!snap.prompt.includes("短讯")) throw new Error("picked prompt")

await store.add("课题预审")
snap = await store.snapshot()
if (snap.openGoals.length !== 1) throw new Error("goal")
await store.done(snap.openGoals[0].id)
snap = await store.snapshot()
if (snap.openGoals.length !== 0) throw new Error("done")

const doc = join(root, "稿.md")
await writeFile(doc, "头\n要改的一段。\n尾", "utf8")
const text = "头\n要改的一段。\n尾"
const start = text.indexOf("要改")
const end = start + "要改的一段。".length
await store.queuePatch({ path: doc, text, start, end, instruction: "改成调研口径" })
await store.applyPatch("已经改成调研口径。")
const after = await (await import("node:fs/promises")).readFile(doc, "utf8")
if (!after.includes("已经改成调研口径") || after.includes("要改的一段")) throw new Error("patch file")

await store.addReview(doc, "- 落款缺日期\n也许再润色")
snap = await store.snapshot()
if (snap.reviews[0].issues.length !== 1) throw new Error("review")
if (snap.reviews[0].rewritten !== false) throw new Error("rewrite")

await store.bindFiles("T-1", [join(root, "a.docx")])
const cards = mergeTaskCards(
	[{ id: "T-1", text: "任务: 周报", status: "replied" }],
	(await store.load()).tasks,
)
if (cards[0].files.length !== 1) throw new Error("card files")

const kb = join(root, "kb")
await mkdir(kb, { recursive: true })
await writeFile(join(kb, "课题预审.md"), "上周交的预审稿", "utf8")
const hits = await searchRoots([kb], "上周课题预审", 5)
if (!hits[0]?.path.includes("课题预审")) throw new Error("search roots")

await rm(root, { recursive: true, force: true })
console.log("PASS store")
