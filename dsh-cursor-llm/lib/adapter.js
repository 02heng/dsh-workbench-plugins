import { pathToFileURL } from "node:url"
import { resolvedCursorModel } from "./model-info.js"

const sessions = new Map()

async function loadLlm() {
	try {
		return await import("@deepseek-ai/dsh-llm")
	} catch {
		return await import(pathToFileURL("D:/deepseek-harness/packages/llm/llm/src/index.ts").href)
	}
}

async function loadSdk() {
	return import(pathToFileURL("D:/dsh-plugins/dsh-cursor-delegate/node_modules/@cursor/sdk/dist/esm/index.js").href)
}

async function disposeAgent(agent) {
	if (!agent) return
	if (typeof agent[Symbol.asyncDispose] === "function") {
		await agent[Symbol.asyncDispose]()
		return
	}
	if (typeof agent.close === "function") await agent.close()
}

function textOfAssistant(event) {
	const content = event?.message?.content
	if (!Array.isArray(content)) return ""
	return content.filter((block) => block?.type === "text").map((block) => block.text ?? "").join("")
}

export async function releaseSession(sessionId) {
	const remembered = sessions.get(sessionId)
	sessions.delete(sessionId)
	await disposeAgent(remembered?.agent)
}

export async function createCursorAdapter({ apiKeyEnv, model, resolveKey, Agent: InjectedAgent }) {
	const { LlmAdapter } = await loadLlm()

	class CursorAdapter extends LlmAdapter {
		providerInfo(provider) {
			return { id: provider, name: "Cursor" }
		}

		listModels(provider) {
			const rows = [
				{ provider, id: "grok-4.6", name: "Cursor Grok 4.6" },
				{ provider, id: "composer-2.5", name: "Composer 2.5" },
				{ provider, id: "auto", name: "Cursor Auto" },
			]
			if (!rows.some((row) => row.id === model)) {
				rows.unshift({ provider, id: model, name: model })
			}
			return Promise.resolve(rows)
		}

		resolveModel(provider, id) {
			return Promise.resolve(resolvedCursorModel(provider, id, model))
		}

		async * stream(options) {
			const { flattenRequest } = await import("./prompt.js")
			const apiKey = await resolveKey(apiKeyEnv)
			const Agent = InjectedAgent ?? (await loadSdk()).Agent
			const sessionId = String(options.sessionId ?? "anon")
			const cwd = options.cwd
				|| (typeof options.messages === "object" && options._cwd)
				|| "D:/dsh-workbench"
			const remembered = sessions.get(sessionId)
			const live = Boolean(remembered?.agent)
			const prompt = flattenRequest(options, { live })
			let agent = remembered?.agent
			try {
				if (!agent) {
					if (remembered?.agentId) {
						agent = await Agent.resume(remembered.agentId, { apiKey })
					} else {
						agent = await Agent.create({
							apiKey,
							model: { id: options.model || model },
							local: { cwd: remembered?.cwd || cwd },
						})
					}
				}
				if (agent) {
					sessions.set(sessionId, {
						agentId: agent.agentId || remembered?.agentId,
						cwd: remembered?.cwd || cwd,
						agent,
					})
				}
				const run = await agent.send(prompt)
				if (options.signal?.aborted && typeof run.cancel === "function") await run.cancel()
				else if (options.signal) {
					options.signal.addEventListener("abort", () => {
						if (typeof run.cancel === "function") void run.cancel()
					}, { once: true })
				}

				yield { type: "block-start", index: 0, blockType: "text" }
				let assembled = ""
				let thinking = ""
				let thinkOpen = false

				const emitText = function* (delta) {
					if (!delta) return
					assembled += delta
					yield { type: "text-delta", index: 0, text: delta }
				}

				if (typeof run.stream === "function" && (!run.supports || run.supports("stream"))) {
					for await (const event of run.stream()) {
						if (event?.type === "thinking" && event.text) {
							if (!thinkOpen) {
								yield { type: "block-start", index: 1, blockType: "reasoning" }
								thinkOpen = true
							}
							const next = String(event.text)
							const delta = next.startsWith(thinking) ? next.slice(thinking.length) : next
							thinking = next
							if (delta) yield { type: "reasoning-delta", index: 1, text: delta }
						}
						if (event?.type === "assistant") {
							const full = textOfAssistant(event)
							const delta = full.startsWith(assembled) ? full.slice(assembled.length) : (full && !assembled.includes(full) ? full : "")
							yield* emitText(delta)
						}
					}
					if (typeof run.wait === "function" && (!run.supports || run.supports("wait"))) {
						await run.wait()
					}
				} else {
					const result = await run.wait()
					const text = result.status === "error" && result.error?.message
						? result.error.message
						: String(result.result ?? "")
					yield* emitText(text)
				}

				if (thinkOpen) {
					yield { type: "block-end", index: 1, block: { type: "reasoning", text: thinking } }
				}
				yield { type: "block-end", index: 0, block: { type: "text", text: assembled } }
				yield { type: "finish", reason: { kind: "stop" } }
			} catch (error) {
				const dead = sessions.get(sessionId)
				sessions.set(sessionId, { agentId: dead?.agentId, cwd: dead?.cwd || cwd })
				await disposeAgent(agent)
				throw error
			}
		}
	}

	return new CursorAdapter()
}

export function bindSessionCwd(sessionId, cwd) {
	const prev = sessions.get(sessionId) ?? {}
	sessions.set(sessionId, { ...prev, cwd })
}
