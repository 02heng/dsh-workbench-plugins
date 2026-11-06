export const LOCAL_MODEL = {
	id: "deepseek-flash",
	name: "DeepSeek 本地",
	description: "网页网关，协议对齐官网 deepseek-flash（思考 / 识图 / 工具）",
	inputModalities: ["text", "image"],
	context: { contextWindow: 1_048_576 },
	reasoning: {
		efforts: [
			{ id: "off", name: "关闭思考" },
			{ id: "high", name: "深度思考" },
		],
		defaultEffort: "high",
	},
}

export function listLocalModels(provider) {
	return [{
		provider,
		id: LOCAL_MODEL.id,
		name: LOCAL_MODEL.name,
		description: LOCAL_MODEL.description,
		inputModalities: LOCAL_MODEL.inputModalities,
	}]
}

export function resolveLocalModel(provider, id) {
	return {
		provider,
		id: LOCAL_MODEL.id,
		name: LOCAL_MODEL.name,
		description: LOCAL_MODEL.description,
		inputModalities: LOCAL_MODEL.inputModalities,
		context: LOCAL_MODEL.context,
		reasoning: LOCAL_MODEL.reasoning,
	}
}
