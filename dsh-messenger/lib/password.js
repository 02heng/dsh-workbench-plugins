import { applyPromptTemplate, prefixesOf } from "./lines.js"

const DEFAULT_PASSWORDS = [{ id: "pw-1", token: "任务:", prompt: "{{input}}" }]

export function parseInbound(text, kind = "text", passwords = DEFAULT_PASSWORDS) {
	if (kind !== "text") return { action: "ignore", prompt: "", passwordId: "" }
	const raw = String(text ?? "").trim()
	if (!raw) return { action: "record", prompt: "", passwordId: "" }
	const list = Array.isArray(passwords) && passwords.length ? passwords : DEFAULT_PASSWORDS
	const ranked = [...list].sort((a, b) => {
		const al = prefixesOf(a.token)[0]?.length ?? 0
		const bl = prefixesOf(b.token)[0]?.length ?? 0
		return bl - al
	})
	for (const password of ranked) {
		for (const prefix of prefixesOf(password.token)) {
			if (!raw.startsWith(prefix)) continue
			const rest = raw.slice(prefix.length).trim()
			if (!rest) return { action: "empty-password", prompt: "", passwordId: password.id }
			return {
				action: "dispatch",
				prompt: applyPromptTemplate(password.prompt, rest),
				passwordId: password.id,
			}
		}
	}
	return { action: "record", prompt: raw, passwordId: "" }
}
