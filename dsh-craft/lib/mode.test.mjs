import { gateAction, modeForChannel, normalizeExpert, normalizeMode, promptFor } from "./mode.js"

function assert(cond, msg) {
	if (!cond) throw new Error(msg)
}

assert(normalizeMode("ask") === "ask", "ask")
assert(normalizeMode("plan") === "plan", "plan")
assert(normalizeMode("craft") === "craft", "craft")
try { normalizeMode("god"); throw new Error("should reject") } catch (e) {
	if (e.message === "should reject") throw e
	assert(e.message.includes("ask"), e.message)
}

assert(normalizeExpert("official") === "official", "official")
assert(normalizeExpert("") === "none", "empty expert")
try { normalizeExpert("hacker"); throw new Error("should reject") } catch (e) {
	if (e.message === "should reject") throw e
}

assert(modeForChannel("weixin") === "craft", "weixin forces craft")
assert(modeForChannel("web") == null, "web keeps current")

gateAction("craft", "write")
gateAction("craft", "weixin")
gateAction("ask", "read")
try { gateAction("ask", "write"); throw new Error("ask write") } catch (e) {
	if (e.message === "ask write") throw e
	assert(e.message.includes("问一问"), e.message)
}
try { gateAction("ask", "weixin"); throw new Error("ask wx") } catch (e) {
	if (e.message === "ask wx") throw e
	assert(e.message.includes("问一问"), e.message)
}
try { gateAction("plan", "write"); throw new Error("plan write") } catch (e) {
	if (e.message === "plan write") throw e
	assert(e.message.includes("想一想"), e.message)
}
gateAction("plan", "write", { planConfirmed: true })
gateAction("plan", "weixin", { planConfirmed: true })

const ask = promptFor({ mode: "ask", expert: "none" })
assert(ask.includes("问一问"), ask)
assert(ask.includes("不发微信"), ask)
const plan = promptFor({ mode: "plan", expert: "thesis", planConfirmed: false })
assert(plan.includes("2") && plan.includes("做法"), plan)
assert(plan.includes("课题"), plan)
assert(plan.includes("craft_options"), plan)
const craft = promptFor({ mode: "craft", expert: "official" })
assert(craft.includes("做一做"), craft)
assert(craft.includes("公文"), craft)
assert(craft.includes("文号"), craft)
const picked = promptFor({
	mode: "plan",
	expert: "none",
	planConfirmed: true,
	options: { picked: 0, options: [{ title: "纸感", summary: "米白墨绿" }] },
})
assert(picked.includes("已选定做法：纸感"), picked)

console.log("PASS mode")
