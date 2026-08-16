export async function describeOpenAi({ baseUrl, apiKey, model, mime, base64, question }) {
	const root = String(baseUrl || "").replace(/\/+$/, "")
	if (!root || !apiKey || !model) throw new Error("未配置 VISION_BASE_URL / VISION_API_KEY / VISION_MODEL")
	const prompt = [
		"你是视觉解析器。只根据这张图写出可见事实，不要猜测看不见的内容。",
		"用中文，分三块：【文字】原样抄录；【版面】结构/界面/图表；【场景】物体与关系。",
		question ? `用户问题：${question}` : "",
	].filter(Boolean).join("\n")

	const res = await fetch(`${root}/chat/completions`, {
		method: "POST",
		headers: {
			authorization: `Bearer ${apiKey}`,
			"content-type": "application/json",
		},
		body: JSON.stringify({
			model,
			temperature: 0.1,
			messages: [{
				role: "user",
				content: [
					{ type: "text", text: prompt },
					{ type: "image_url", image_url: { url: `data:${mime};base64,${base64}` } },
				],
			}],
		}),
	})
	const raw = await res.text()
	if (!res.ok) throw new Error(`视觉接口 ${res.status}：${raw.slice(0, 240)}`)
	const json = JSON.parse(raw)
	const text = json?.choices?.[0]?.message?.content
	if (typeof text !== "string" || !text.trim()) throw new Error("视觉接口没有返回正文")
	return text.trim()
}
