function closeBlock(block) {
	if (block.kind === "reasoning") return { type: "reasoning", text: block.text }
	if (block.kind === "tool-call") {
		return { type: "tool-call", id: block.id || "", name: block.name || "", arguments: block.text }
	}
	return { type: "text", text: block.text }
}

function acceptIdentity(current, incoming) {
	return typeof incoming === "string" && incoming.length > 0 ? incoming : current
}

function finishOf(reason) {
	if (reason === "tool_calls") return { kind: "tool-calls" }
	if (reason === "length") return { kind: "max-tokens" }
	return { kind: "stop" }
}

export async function* translateSse(payloads) {
	let nextIndex = 0
	let textBlock
	let reasoningBlock
	const toolBlocks = new Map()
	const order = []
	let pendingFinish = { kind: "stop" }

	function open(kind) {
		const block = { index: nextIndex++, kind, text: "", id: "", name: "" }
		order.push(block)
		return block
	}

	for await (const payload of payloads) {
		if (payload === "[DONE]") {
			for (const block of order) {
				yield { type: "block-end", index: block.index, block: closeBlock(block) }
			}
			yield { type: "finish", reason: pendingFinish }
			return
		}

		let chunk
		try {
			chunk = JSON.parse(payload)
		} catch {
			continue
		}

		for (const choice of chunk.choices ?? []) {
			const delta = choice.delta || {}
			const reasoning = delta.reasoning_content
			if (typeof reasoning === "string" && reasoning.length > 0) {
				if (!reasoningBlock) {
					reasoningBlock = open("reasoning")
					yield { type: "block-start", index: reasoningBlock.index, blockType: "reasoning" }
				}
				reasoningBlock.text += reasoning
				yield { type: "reasoning-delta", index: reasoningBlock.index, text: reasoning }
			}

			const content = delta.content
			if (typeof content === "string" && content.length > 0) {
				if (!textBlock) {
					textBlock = open("text")
					yield { type: "block-start", index: textBlock.index, blockType: "text" }
				}
				textBlock.text += content
				yield { type: "text-delta", index: textBlock.index, text: content }
			}

			for (const call of delta.tool_calls ?? []) {
				const idx = Number.isInteger(call.index) ? call.index : 0
				let block = toolBlocks.get(idx)
				if (!block) {
					block = open("tool-call")
					toolBlocks.set(idx, block)
					yield { type: "block-start", index: block.index, blockType: "tool-call" }
				}
				block.id = acceptIdentity(block.id, call.id)
				block.name = acceptIdentity(block.name, call.function?.name)
				const fragment = call.function?.arguments ?? ""
				block.text += fragment
				yield {
					type: "tool-call-delta",
					index: block.index,
					id: block.id,
					...block.name ? { name: block.name } : {},
					argumentsDelta: fragment,
				}
			}

			if (typeof choice.finish_reason === "string" && choice.finish_reason) {
				pendingFinish = finishOf(choice.finish_reason)
			}
		}
	}

	throw new Error("SSE ended without [DONE]")
}
