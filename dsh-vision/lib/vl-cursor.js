import { copyFile, mkdir, rm, writeFile } from "node:fs/promises"
import { basename, extname, join } from "node:path"
import { pathToFileURL } from "node:url"

function clip(text, max = 12000) {
	const value = String(text ?? "")
	return value.length <= max ? value : `${value.slice(0, max)}\n…[truncated]`
}

async function loadSdk() {
	try {
		return await import(pathToFileURL("D:/dsh-plugins/dsh-cursor-delegate/node_modules/@cursor/sdk/dist/esm/index.js").href)
	} catch (error) {
		throw new Error(`无法加载 Cursor SDK：${error?.message ?? error}`)
	}
}

async function disposeAgent(agent) {
	if (!agent) return
	if (typeof agent[Symbol.asyncDispose] === "function") {
		await agent[Symbol.asyncDispose]()
		return
	}
	if (typeof agent.close === "function") await agent.close()
}

export async function describeCursor({ apiKey, model, imagePath, scratch, question, signal }) {
	if (!apiKey) throw new Error("缺少 CURSOR_API_KEY，无法用 Cursor 当眼睛")
	const id = `see-${Date.now().toString(36)}`
	const cwd = join(scratch, id)
	await mkdir(cwd, { recursive: true })
	const file = join(cwd, `shot${extname(imagePath) || ".png"}`)
	await copyFile(imagePath, file)
	await writeFile(join(cwd, "TASK.md"), "只读这张图，不要改任何文件。\n", "utf8")

	const { Agent } = await loadSdk()
	let agent
	try {
		agent = await Agent.create({
			apiKey,
			model: { id: model || "composer-2.5" },
			local: { cwd },
		})
		const prompt = [
			"你只做视觉解析，不要改文件、不要安装软件、不要访问网络。",
			`打开 ${basename(file)} 。`,
			"用中文写三块：【文字】原样抄录图中所有可读文字；【版面】界面/表格/图表结构；【场景】物体、人物、关系。",
			"看不见的不要猜。只输出解析正文。",
			question ? `用户问题：${question}` : "",
		].filter(Boolean).join("\n")
		const run = await agent.send(prompt)
		if (signal?.aborted && typeof run.cancel === "function") await run.cancel()
		const result = await run.wait()
		const text = result.status === "error" && result.error?.message
			? result.error.message
			: (typeof result.result === "string" ? result.result : "")
		if (!String(text).trim()) throw new Error("Cursor 眼睛没有返回正文")
		return clip(text.trim())
	} finally {
		await disposeAgent(agent)
		await rm(cwd, { recursive: true, force: true })
	}
}
