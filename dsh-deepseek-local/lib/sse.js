export async function* readSse(response) {
	if (!response?.body) return
	const reader = response.body.getReader()
	const dec = new TextDecoder()
	let buf = ""
	while (true) {
		const { value, done } = await reader.read()
		if (done) break
		buf += dec.decode(value, { stream: true }).replace(/\r\n/g, "\n")
		const lines = buf.split("\n")
		buf = lines.pop() || ""
		for (const line of lines) {
			const trimmed = line.trim()
			if (!trimmed.startsWith("data:")) continue
			const payload = trimmed.slice(5).trim()
			if (payload) yield payload
		}
	}
	const tail = buf.trim()
	if (tail.startsWith("data:")) {
		const payload = tail.slice(5).trim()
		if (payload) yield payload
	}
}
