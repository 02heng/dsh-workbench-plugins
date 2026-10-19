import { readFileSync } from "node:fs"

function fail(msg) {
	console.error("FAIL", msg)
	process.exit(1)
}

const src = readFileSync(new URL("./client.js", import.meta.url), "utf8")
if (!src.includes("conversation.input.left")) fail("chips must sit inside the composer tool row")
if (!src.includes("conversation.input.right")) fail("chips must also sit next to the model selector")
if (src.includes('name: "conversation.input.dock"')) fail("chips must not sit on the row above the input")
if (!src.includes('label === "对话"')) fail("dock only belongs to 对话")
if (!src.includes("dsh-tab-change")) fail("dock must follow the conversation tab")
if (!src.includes("问一问") || !src.includes("想一想") || !src.includes("做一做")) {
	fail("mode chips must use conversation wording")
}
if (!src.includes("/plugins/dsh-dashboard/craft-chips.js")) fail("chips must load from the dashboard route that is actually served")
const chips = readFileSync(new URL("./chips.js", import.meta.url), "utf8")
if (!chips.includes("input[type='file']")) fail("chips attach next to the official file picker")
if (!chips.includes("aria-haspopup")) fail("chips also anchor on the plus button when the file input is absent")
if (!chips.includes("/plugins/dsh-dashboard/craft-state")) fail("chip state must use the dashboard route")
if (!chips.includes('position:fixed')) fail("chips must float over the composer gap, not inside React's tool row")
if (!chips.includes("做一做") || !chips.includes("公文")) fail("chips.js must paint mode and expert buttons")
if (!chips.includes("data-workbench")) fail("chips hide only under the atelier overlay")
console.log("PASS craft-client")
