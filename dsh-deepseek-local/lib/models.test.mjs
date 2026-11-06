import { listLocalModels, resolveLocalModel } from "./models.js"

function fail(msg, extra) {
	console.error("FAIL", msg, extra ?? "")
	process.exit(1)
}

const listed = listLocalModels("deepseek-local")
if (listed.length !== 1) fail("official catalog is one model", listed)
if (listed[0].id !== "deepseek-flash") fail("official model id", listed[0])
if (!listed[0].inputModalities.includes("image")) fail("flash accepts images", listed[0])

const flash = resolveLocalModel("deepseek-local", "deepseek-flash")
if (flash.id !== "deepseek-flash") fail("resolve official id", flash)
if (flash.reasoning?.defaultEffort !== "high") fail("official default thinking", flash)
if (flash.context?.contextWindow !== 1_048_576) fail("1m context", flash)

const alias = resolveLocalModel("deepseek-local", "flash")
if (alias.id !== "deepseek-flash") fail("old flash alias maps to official id", alias)
if (!alias.inputModalities.includes("image")) fail("alias still vision-capable", alias)

console.log("PASS deepseek-local-models")
