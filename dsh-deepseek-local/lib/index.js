import z from "@deepseek-ai/schemastery"
import { createLocalAdapter } from "./adapter.js"

export const name = "dsh-deepseek-local"
export const inject = ["llm"]
export const Config = z.object({
	apiKeyEnv: z.string().default("DEEPSEEK_LOCAL_API_KEY"),
	baseURL: z.string().default("http://127.0.0.1:8765/v1"),
	provider: z.string().default("deepseek-local"),
})

function envKey(name) {
	const value = process.env[name]
	if (typeof value === "string" && value.trim()) return value.trim()
	throw new Error(`缺少 ${name}。在凭证里写入 sk-local 后重启 dsh web。`)
}

export async function apply(ctx, config = {}) {
	const provider = config.provider || "deepseek-local"
	const adapter = await createLocalAdapter({
		baseURL: config.baseURL || "http://127.0.0.1:8765/v1",
		apiKeyEnv: config.apiKeyEnv || "DEEPSEEK_LOCAL_API_KEY",
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
}
