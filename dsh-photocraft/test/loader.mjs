// pc-verify: module resolve hook，把 DSH 运行时依赖指向本地 stub。
export async function resolve(specifier, context, next) {
	if (
		specifier.startsWith("@deepseek-ai/") ||
		specifier.startsWith("@dshthemes/") ||
		specifier === "vue" ||
		specifier === "react" ||
		specifier === "@cursor/sdk"
	) {
		return { url: new URL("./stub.mjs", import.meta.url).href, shortCircuit: true, format: "module" }
	}
	return next(specifier, context)
}
