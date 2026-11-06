import { pathToFileURL } from "node:url"
import { toOpenAiMessages, toOpenAiTools } from "./messages.js"
import { listLocalModels, resolveLocalModel } from "./models.js"
import { readSse } from "./sse.js"
import { thinkingPayload } from "./thinking.js"
import { translateSse } from "./translate.js"

async function loadLlm() {
	try {
		return await import("@deepseek-ai/dsh-llm")
	} catch {
		return await import(pathToFileURL("D:/deepseek harness/resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-llm/lib/index.js").href)
	}
}

export async function createLocalAdapter({ baseURL, apiKeyEnv, resolveKey, fetchImpl }) {
	const { LlmAdapter } = await loadLlm()
	const fetchFn = fetchImpl || globalThis.fetch
	const root = String(baseURL || "http://127.0.0.1:8765/v1").replace(/\/+$/, "")

	class DeepSeekLocalAdapter extends LlmAdapter {
		providerInfo(provider) {
			return { id: provider, name: "DeepSeek 本地网关" }
		}

		listModels(provider) {
			return Promise.resolve(listLocalModels(provider))
		}

		resolveModel(provider, id) {
			return Promise.resolve(resolveLocalModel(provider, id))
		}

		async * stream(options) {
			const apiKey = await resolveKey(apiKeyEnv)
			const model = options.model || "deepseek-flash"
			const effort = options.reasoningEffort ?? "high"
			const tools = toOpenAiTools(options.tools)
			const res = await fetchFn(`${root}/chat/completions`, {
				method: "POST",
				headers: {
					authorization: `Bearer ${apiKey}`,
					"content-type": "application/json",
				},
				body: JSON.stringify({
					model,
					messages: toOpenAiMessages(options),
					stream: true,
					thinking: thinkingPayload(model, effort),
					...tools.length ? { tools } : {},
				}),
				signal: options.signal,
			})
			if (!res.ok) {
				const detail = await res.text().catch(() => "")
				throw new Error(`本地网关 ${res.status}: ${detail.slice(0, 240) || res.statusText}`)
			}
			yield* translateSse(readSse(res))
		}
	}

	return new DeepSeekLocalAdapter()
}
