import { mkdir, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { listDeliverables } from "./deliverables.js"

const root = "D:/dsh-workbench/messenger/_test-deliverables"
await rm(root, { recursive: true, force: true })
await mkdir(join(root, "docs", "方案"), { recursive: true })
await mkdir(join(root, "messenger"), { recursive: true })
await mkdir(join(root, ".dsh"), { recursive: true })

const since = Date.now() - 1000
await writeFile(join(root, "docs", "方案", "调研.docx"), "docx")
await writeFile(join(root, "docs", "方案", "表.xlsx"), "xlsx")
await writeFile(join(root, "docs", "方案", "build.py"), "print(1)")
await writeFile(join(root, "docs", "方案", "pack.zip"), "zip")
await writeFile(join(root, "docs", "old.docx"), "old")
await (await import("node:fs/promises")).utimes(join(root, "docs", "old.docx"), new Date(since - 60_000), new Date(since - 60_000))
await writeFile(join(root, "messenger", "secret.docx"), "no")
await writeFile(join(root, ".dsh", "skip.docx"), "no")

const files = await listDeliverables(root, since)
if (files.length !== 2 || !files.some((p) => p.endsWith("调研.docx")) || !files.some((p) => p.endsWith("表.xlsx"))) {
	console.error("FAIL list", files)
	process.exit(1)
}
if (files.some((p) => p.includes("old.docx") || p.includes("secret") || p.endsWith(".py") || p.endsWith(".zip"))) {
	console.error("FAIL leaked", files)
	process.exit(1)
}

await rm(root, { recursive: true, force: true })
console.log("PASS deliverables")
