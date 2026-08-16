import { addGoal, completeGoal, openGoals } from "./goals.js"

function assert(cond, msg) {
	if (!cond) throw new Error(msg)
}

let list = []
list = addGoal(list, "课题预审")
list = addGoal(list, "周报")
assert(list.length === 2, "two")
assert(openGoals(list).length === 2, "both open")
assert(list[0].done === false, "not done")
assert(list[0].title === "课题预审", "title")

list = completeGoal(list, list[0].id)
assert(openGoals(list).length === 1, "one open")
assert(openGoals(list)[0].title === "周报", "week")
assert(list.find((g) => g.title === "课题预审").done === true, "marked")

try { addGoal(list, "  "); throw new Error("empty") } catch (e) {
	if (e.message === "empty") throw e
}
try { completeGoal(list, "nope"); throw new Error("missing") } catch (e) {
	if (e.message === "missing") throw e
}

console.log("PASS goals")
