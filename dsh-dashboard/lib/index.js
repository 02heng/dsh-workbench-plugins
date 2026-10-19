import z from "@deepseek-ai/schemastery"
import { craftModePrompt } from "./craft-prompt.js"
import { registerWall } from "./http.js"

export const name = "dsh-dashboard"
export const inject = []
export const Config = z.object({
	dcRoot: z.string().default("D:/dsh-datacenter"),
	docsRoot: z.string().default("D:/dsh-workbench/docs"),
	kbRoot: z.string().default("D:/dsh-kb"),
	schoolPath: z.string().default("D:/dsh-workbench/school.json"),
})

export function apply(ctx, config = {}) {
	const resolved = {
		dcRoot: config.dcRoot ?? "D:/dsh-datacenter",
		docsRoot: config.docsRoot ?? "D:/dsh-workbench/docs",
		kbRoot: config.kbRoot ?? "D:/dsh-kb",
		schoolPath: config.schoolPath ?? "D:/dsh-workbench/school.json",
	}
	const WEB_SERVER_KEYS = ["webServer", "httpServer"]
	// 0.2.1 前后内测两个通道的服务键曾出现 webServer / httpServer 两种命名（参照生态
	// dsh-agent-teams 的 WEB_SERVER_KEYS 写法）：惰性探测 + 服务绑定事件重试，服务确实
	// 缺失时留一条 warn，避免更新后静默丢掉整个工作台 UI。
	const readWebService = (key) => {
		try {
			const viaReflect = ctx.reflect?.get?.(key, false)
			if (viaReflect !== undefined) return viaReflect
		} catch {
			// ignore: 继续用 ctx.get 兜底
		}
		try {
			return ctx.get(key)
		} catch {
			return undefined
		}
	}
	let webSurfaceRegistered = false
	const registerWebSurface = () => {
		if (webSurfaceRegistered) return
		const webServer = WEB_SERVER_KEYS.map((key) => readWebService(key)).find((service) => service !== undefined)
		if (webServer === undefined) return
		webSurfaceRegistered = true
		ctx.effect(() => {
			return registerWall(webServer, resolved)
		}, "dsh-dashboard.wall")
	}
	registerWebSurface()
	ctx.on("internal/service", (serviceName) => {
		if (WEB_SERVER_KEYS.includes(serviceName)) registerWebSurface()
	})
	ctx.on("ready", () => {
		registerWebSurface()
		if (!webSurfaceRegistered) ctx.logger?.warn?.("[dashboard] 未找到 webServer/httpServer 服务，工作台 UI 未挂载")
	})
	ctx.inject(["systemPrompt"], (spCtx) => {
		spCtx.effect(() => spCtx.systemPrompt.context({
			name: "dsh-craft:mode",
			order: 40,
			text: () => craftModePrompt(),
		}), "dsh-dashboard:craft-mode")
	})
}
