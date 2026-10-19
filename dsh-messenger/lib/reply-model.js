export function flattenModelCatalog(groups = []) {
	const rows = []
	for (const group of groups) {
		const provider = String(group?.id ?? "").trim()
		if (!provider) continue
		for (const model of group.models || []) {
			const id = String(model?.id ?? "").trim()
			if (!id) continue
			const name = String(model?.name || id).trim()
			const efforts = model?.reasoning?.efforts
			if (Array.isArray(efforts) && efforts.length) {
				for (const effort of efforts) {
					const effortId = String(effort?.id ?? "").trim()
					if (!effortId) continue
					const effortName = String(effort?.name || effortId).trim()
					rows.push({
						provider,
						model: id,
						effort: effortId,
						label: `${name} ${effortName}`.trim(),
					})
				}
				continue
			}
			rows.push({ provider, model: id, label: name })
		}
	}
	return rows
}

export function replySelection(config = {}) {
	const provider = String(config.replyProvider ?? "").trim()
	const model = String(config.replyModel ?? "").trim()
	if (!provider || !model) return null
	const effort = String(config.replyEffort ?? "").trim()
	return {
		provider,
		model,
		...effort ? { reasoningEffort: effort } : {},
	}
}

export function selectedLabel(rows = [], picked = null, fallback = "") {
	if (!picked) return fallback
	const hit = rows.find((row) => (
		row.provider === picked.provider
		&& row.model === picked.model
		&& String(row.effort ?? "") === String(picked.reasoningEffort ?? "")
	))
	return hit?.label || fallback
}

function unwrapRpc(result) {
	if (result && typeof result === "object" && "result" in result && result.result) return result.result
	return result ?? {}
}

function groupsOf(result) {
	const inner = unwrapRpc(result)
	const value = inner.value ?? inner
	if (Array.isArray(value.groups)) return value.groups
	if (Array.isArray(inner.groups)) return inner.groups
	return []
}

export async function catalogFromLlm(llm) {
	if (!llm?.listProviders || !llm?.listModels) return []
	const providers = llm.listProviders()
	if (!Array.isArray(providers) || !providers.length) return []
	const groups = []
	for (const provider of providers) {
		const id = String(provider?.id ?? "").trim()
		if (!id) continue
		try {
			const models = await llm.listModels(id)
			const entries = []
			for (const model of models || []) {
				const modelId = String(model?.id ?? "").trim()
				if (!modelId) continue
				let reasoning = model?.reasoning
				if (!reasoning && typeof llm.resolveModelInfo === "function") {
					try {
						const resolved = await llm.resolveModelInfo(id, modelId)
						reasoning = resolved?.reasoning
					} catch { /* keep advisory row */ }
				}
				entries.push({
					id: modelId,
					name: String(model?.name || modelId).trim(),
					...reasoning ? { reasoning } : {},
				})
			}
			if (entries.length) {
				groups.push({ id, name: provider.name || id, models: entries })
			}
		} catch { /* skip a broken provider */ }
	}
	return flattenModelCatalog(groups)
}

export async function loadReplyCatalog(api, llm) {
	const fromLlm = await catalogFromLlm(llm)
	if (fromLlm.length) return fromLlm
	const proxy = typeof api === "function" ? api() : api
	if (!proxy?.llm?.models) return []
	try {
		const withRpc = await proxy.llm.models({
			rpcId: `wx-models-${Date.now()}`,
			payload: {},
		})
		const rows = flattenModelCatalog(groupsOf(withRpc))
		if (rows.length) return rows
		const bare = await proxy.llm.models({})
		return flattenModelCatalog(groupsOf(bare))
	} catch {
		return []
	}
}
