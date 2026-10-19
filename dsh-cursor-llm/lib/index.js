import z from "@deepseek-ai/schemastery"
import { bindSessionCwd, createCursorAdapter, releaseSession } from "./adapter.js"
import { routeChat } from "./route.js"

export const name = "dsh-cursor-llm"
export const inject = ["llm"]
export const Config = z.object({
	apiKeyEnv: z.string().default("CURSOR_API_KEY"),
	model: z.string().default("grok-4.6"),
	provider: z.string().default("cursor"),
})

function envKey(name) {
	const value = process.env[name]
	if (typeof value === "string" && value.trim()) return value.trim()
	throw new Error(`缺少 ${name}。到 https://cursor.com/dashboard 创建 User API Key，写入环境变量后重启 dsh web。不要把密钥写进对话。`)
}

export async function apply(ctx, config = {}) {
	const provider = config.provider || "cursor"
	const model = config.model || "grok-4.6"
	const apiKeyEnv = config.apiKeyEnv || "CURSOR_API_KEY"

	const adapter = await createCursorAdapter({
		apiKeyEnv,
		model,
		resolveKey: async (name) => {
			const credentials = ctx.get("credentials")
			if (credentials !== undefined) {
				try {
					const hit = await credentials.resolve(name)
					const value = hit?.value?.trim()
					if (value) return value
				} catch { /* fall through */ }
			}
			return envKey(name)
		},
	})

	ctx.llm.registerAdapter([provider], adapter)

	ctx.on("agent/request", async (payload, next) => {
		const resolved = await next()
		const session = payload.agent?.session
		const header = session?.header ?? session?.requestHeader?.() ?? {}
		const sessionId = String(session?.id ?? header.id ?? "")
		const cwd = header.cwd
		if (sessionId && typeof cwd === "string" && cwd) bindSessionCwd(sessionId, cwd)
		return routeChat(resolved, {
			...header,
			agentPreset: header.agentPreset ?? header.meta?.agentPreset,
			title: header.title,
		}, { provider, model })
	})

	ctx.on("session/disposed", (session) => {
		const id = String(session?.id ?? session?.header?.id ?? "")
		if (id) void releaseSession(id)
	})
}
