import { mkdir, rm, stat } from "node:fs/promises"
import { join } from "node:path"
import { captureScreen } from "./shot.js"

const dir = "D:/dsh-workbench/messenger/_test-shot"
await rm(dir, { recursive: true, force: true })
await mkdir(dir, { recursive: true })
const dest = join(dir, "full.png")
const result = await captureScreen(dest)
const info = await stat(result.path)
if (info.size < 1000) {
	console.error("FAIL tiny shot", info.size)
	process.exit(1)
}
await rm(dir, { recursive: true, force: true })
console.log("PASS shot", info.size)

async function expectFail(dest, label) {
	try {
		await captureScreen(dest)
		console.error("FAIL should throw", label)
		process.exit(1)
	} catch (error) {
		if (String(error.message) !== "截屏失败") {
			console.error("FAIL message", label, error)
			process.exit(1)
		}
	}
}

await expectFail("relative.png", "relative")
await expectFail("C:/Windows/Temp/dsh-shot.png", "outside")
await expectFail("D:/dsh-workbench/messenger/../escape.png", "escape")
console.log("PASS shot-dest")
