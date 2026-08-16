import { access } from "node:fs/promises"
import { isAbsolute, resolve } from "node:path"
import z from "@deepseek-ai/schemastery"
import { defineTool } from "@deepseek-ai/dsh-tools"

export const name = "dsh-cursor-delegate"
export const inject = ["tools"]

export const Config = z.object({
	apiKeyEnv: z.string().default("CURSOR_API_KEY"),
	model: z.string().default("grok-4.6"),
	defaultCwd: z.string().default(""),
	maxResultChars: z.number().default(24000),
})

function sessionCwd(agent) {
	const cwd = agent?.session?.header?.cwd
	return typeof cwd === "string" && cwd.length > 0 ? cwd : process.cwd()
}

function clip(text, maxChars) {
	if (typeof text !== "string") return ""
	if (text.length <= maxChars) return text
	return `${text.slice(0, maxChars)}\n…[truncated ${text.length - maxChars} chars]`
}

function errorMessage(error) {
	if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
		return error.message
	}
	return String(error)
}

async function resolveApiKey(ctx, config) {
	const envName = config.apiKeyEnv || "CURSOR_API_KEY"
	const fromEnv = process.env[envName]?.trim()
	if (fromEnv) return fromEnv

	const credentials = ctx.get("credentials")
	if (credentials !== undefined) {
		try {
			const hit = await credentials.resolve(envName)
			const value = hit?.value?.trim()
			if (value) return value
		} catch {
			// branded refs or missing provider — fall through
		}
	}

	throw new Error(
		`缺少 ${envName}。到 https://cursor.com/dashboard/integrations 创建 User API Key，写入用户或系统环境变量后重启 dsh web。不要把密钥写进对话或 YAML。`,
	)
}

async function resolveCwd(requested, agent) {
	const raw = typeof requested === "string" && requested.trim() ? requested.trim() : sessionCwd(agent)
	const cwd = isAbsolute(raw) ? raw : resolve(sessionCwd(agent), raw)
	await access(cwd)
	return cwd
}

async function loadSdk() {
	try {
		return await import("@cursor/sdk")
	} catch (error) {
		throw new Error(`无法加载 @cursor/sdk：${errorMessage(error)}`)
	}
}

async function disposeAgent(agent) {
	if (agent === undefined || agent === null) return
	if (typeof agent[Symbol.asyncDispose] === "function") {
		await agent[Symbol.asyncDispose]()
		return
	}
	if (typeof agent.close === "function") {
		await agent.close()
	}
}

async function waitRun(run, signal) {
	const onAbort = () => {
		if (typeof run.supports === "function" && run.supports("cancel")) {
			void run.cancel()
		}
	}
	if (signal.aborted) onAbort()
	else signal.addEventListener("abort", onAbort, { once: true })
	try {
		return await run.wait()
	} finally {
		signal.removeEventListener("abort", onAbort)
	}
}

function presentResult(value) {
	const lines = [
		`status: ${value.status}`,
		value.agentId ? `agentId: ${value.agentId}` : "",
		value.runId ? `runId: ${value.runId}` : "",
		value.cwd ? `cwd: ${value.cwd}` : "",
		value.model ? `model: ${value.model}` : "",
		"",
		value.text || "(empty)",
	].filter((line, index, all) => line !== "" || all[index + 1] === "")
	return [{ type: "text", text: lines.join("\n") }]
}

/**
 * @param {import("@deepseek-ai/cordis").Context} ctx
 * @param {{apiKeyEnv: string, model: string, defaultCwd: string, maxResultChars: number}} config
 */
export function apply(ctx, config) {
	ctx.tools.register(defineTool({
		name: "cursor_delegate",
		description:
			"把编码/仓库任务派给 Cursor Agent SDK（本地 runtime）。只用于改代码、查仓库、写测试、出 PR 级改动。不要用它处理 Excel/Word/PPT、机房设备或普通问答。需要本机已配置 CURSOR_API_KEY。成功时返回 status、agentId、runId 和最终文本；同一任务的后续追问用 cursor_followup。",
		parameters: {
			task: {
				type: "string",
				required: true,
				description: "给 Cursor Agent 的完整任务说明，需自包含。",
			},
			cwd: {
				type: "string",
				description: "本地仓库绝对路径。默认使用当前 DSH 工作区。",
			},
			model: {
				type: "string",
				description: "Cursor 模型 id，默认 grok-4.6（Cursor Grok 4.6）。也可用 auto。",
			},
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					status: { type: "string", required: true },
					agentId: { type: "string" },
					runId: { type: "string" },
					cwd: { type: "string", required: true },
					model: { type: "string", required: true },
					text: { type: "string", required: true },
				},
			},
			render: (_args, value) => presentResult(value),
		},
		async execute(args, exec) {
			const apiKey = await resolveApiKey(ctx, config)
			const cwd = await resolveCwd(args.cwd || config.defaultCwd, exec.agent)
			const model = (args.model?.trim() || config.model || "grok-4.6").trim()
			const { Agent, CursorAgentError } = await loadSdk()

			let agent
			try {
				agent = await Agent.create({
					apiKey,
					model: { id: model },
					local: { cwd },
				})
				const run = await agent.send(args.task)
				const result = await waitRun(run, exec.signal)
				const rawText = result.status === "error" && result.error?.message
					? result.error.message
					: (typeof result.result === "string" ? result.result : "")
				return {
					status: String(result.status ?? "unknown"),
					agentId: agent.agentId ?? run.agentId,
					runId: result.id,
					cwd,
					model,
					text: clip(rawText, config.maxResultChars),
				}
			} catch (error) {
				if (error && typeof error === "object" && error.constructor?.name === "CursorAgentError") {
					throw new Error(`Cursor 未能启动：${errorMessage(error)}`)
				}
				if (CursorAgentError !== undefined && error instanceof CursorAgentError) {
					throw new Error(`Cursor 未能启动：${errorMessage(error)}`)
				}
				throw error
			} finally {
				await disposeAgent(agent)
			}
		},
	}))

	ctx.tools.register(defineTool({
		name: "cursor_followup",
		description:
			"对已经派过的 Cursor Agent 追加一问。必须传入 cursor_delegate 返回的 agentId。本地 agent 还需要当时的 cwd。",
		parameters: {
			agentId: {
				type: "string",
				required: true,
				description: "cursor_delegate 返回的 agentId。",
			},
			task: {
				type: "string",
				required: true,
				description: "追问内容。",
			},
			cwd: {
				type: "string",
				description: "本地 agent 创建时的工作区。默认当前 DSH 工作区。",
			},
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					status: { type: "string", required: true },
					agentId: { type: "string", required: true },
					runId: { type: "string" },
					cwd: { type: "string", required: true },
					text: { type: "string", required: true },
				},
			},
			render: (_args, value) => presentResult(value),
		},
		async execute(args, exec) {
			const apiKey = await resolveApiKey(ctx, config)
			const cwd = await resolveCwd(args.cwd || config.defaultCwd, exec.agent)
			const { Agent, CursorAgentError } = await loadSdk()

			let agent
			try {
				agent = await Agent.resume(args.agentId.trim(), { apiKey })
				const run = await agent.send(args.task)
				const result = await waitRun(run, exec.signal)
				const rawText = result.status === "error" && result.error?.message
					? result.error.message
					: (typeof result.result === "string" ? result.result : "")
				return {
					status: String(result.status ?? "unknown"),
					agentId: args.agentId.trim(),
					runId: result.id,
					cwd,
					text: clip(rawText, config.maxResultChars),
				}
			} catch (error) {
				if (CursorAgentError !== undefined && error instanceof CursorAgentError) {
					throw new Error(`Cursor 续跑失败：${errorMessage(error)}`)
				}
				if (error && typeof error === "object" && error.constructor?.name === "CursorAgentError") {
					throw new Error(`Cursor 续跑失败：${errorMessage(error)}`)
				}
				throw error
			} finally {
				await disposeAgent(agent)
			}
		},
	}))
}
