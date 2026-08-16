import { parseReviewNotes, reviewPayload } from "./review.js"

function assert(cond, msg) {
	if (!cond) throw new Error(msg)
}

const notes = `确信：
- 文号空着，不能发出
- 第二段把「调研」写成了「调查」

猜测：语气略硬
也许可以再润色标题
`
const issues = parseReviewNotes(notes)
assert(issues.length === 2, `only confident: ${JSON.stringify(issues)}`)
assert(issues[0].includes("文号"), issues[0])
assert(!issues.some((i) => i.includes("润色")), "skip maybe")

const payload = reviewPayload("D:/dsh-workbench/docs/parsed/a.md", notes)
assert(payload.rewritten === false, "never rewrite")
assert(payload.issues.length === 2, "issues")
try {
	reviewPayload("C:/a.md", notes)
	throw new Error("c")
} catch (e) {
	if (e.message === "c") throw e
}

console.log("PASS review")
