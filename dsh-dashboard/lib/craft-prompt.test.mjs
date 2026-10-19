import { writeFileSync, mkdirSync, rmSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { craftModePrompt } from "./craft-prompt.js"

function fail(msg, extra) {
	console.error("FAIL", msg, extra ?? "")
	process.exit(1)
}

const src = readFileSync(new URL("./index.js", import.meta.url), "utf8")
const helper = readFileSync(new URL("./craft-prompt.js", import.meta.url), "utf8")
if (!helper.includes("promptFor")) fail("chip prompt helper must use craft mode text")
if (!src.includes("systemPrompt.context")) fail("dashboard must inject craft chips into systemPrompt")
if (!src.includes("dsh-craft:mode")) fail("prompt block must use the craft mode name")
if (!src.includes("craftModePrompt")) fail("live chip state must be read each turn")

const root = "D:/dsh-workbench/craft/_test-prompt"
mkdirSync(root, { recursive: true })
const file = join(root, "state.json")
writeFileSync(file, JSON.stringify({
	mode: "plan",
	expert: "official",
	planConfirmed: false,
}), "utf8")

const plan = craftModePrompt(file)
if (!plan.includes("当前工作档：想一想")) fail("plan chip must inject 想一想", plan)
if (!plan.includes("craft_options")) fail("想一想 must tell the model to record options", plan)
if (!plan.includes("本回合专家：公文")) fail("公文 chip must inject expert brief", plan)
if (!plan.includes("official-document-writing")) fail("公文 must point at the writing skill", plan)

writeFileSync(file, JSON.stringify({
	mode: "ask",
	expert: "none",
	planConfirmed: false,
}), "utf8")
const ask = craftModePrompt(file)
if (!ask.includes("问一问")) fail("ask chip must inject 问一问", ask)
if (ask.includes("office_*_write") === false) fail("ask must forbid writes", ask)

writeFileSync(file, JSON.stringify({
	mode: "craft",
	expert: "duty",
	planConfirmed: true,
}), "utf8")
const duty = craftModePrompt(file)
if (!duty.includes("做一做")) fail("craft chip must inject 做一做", duty)
if (!duty.includes("值班")) fail("值班 chip must inject duty brief", duty)

rmSync(root, { recursive: true, force: true })
console.log("ok")
