const COMPLETIONS = "https://api.deepseek.com/chat/completions"
const SYSTEM = "你写中文邮件正文，不要主题行，不要假装已发送。"

export async function draftBody({ to, subject, notes }, opts = {}) {
	const env = opts.env ?? process.env
	const fetchFn = opts.fetch ?? globalThis.fetch.bind(globalThis)
	const key = String(env.DEEPSEEK_API_KEY ?? "").trim()
	if (!key) throw new Error("未配置 DEEPSEEK_API_KEY")
	const user = [`to: ${to ?? ""}`, `subject: ${subject ?? ""}`, `notes: ${notes ?? ""}`].join("\n")
	const res = await fetchFn(COMPLETIONS, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			authorization: `Bearer ${key}`,
		},
		body: JSON.stringify({
			model: "deepseek-chat",
			messages: [
				{ role: "system", content: SYSTEM },
				{ role: "user", content: user },
			],
		}),
	})
	const data = await res.json()
	if (!res.ok) throw new Error(String(data?.error?.message ?? data?.error ?? "起草失败"))
	const body = String(data?.choices?.[0]?.message?.content ?? "").trim()
	if (!body) throw new Error("起草失败")
	return { body }
}
