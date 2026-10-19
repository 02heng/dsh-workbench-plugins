import z from "@deepseek-ai/schemastery"
import { finishTurn, watchTurns } from "./dispatch.js"
import { registerDesk } from "./http.js"
import { createSidecar, startSidecarWhenReady } from "./sidecar.js"
import { createStore } from "./store.js"

export const name = "dsh-messenger"
export const inject = ["llm"]
export const Config = z.object({
	root: z.string().default("D:/dsh-workbench/messenger"),
	cwd: z.string().default("D:/dsh-workbench"),
	contact: z.string().default("黄山"),
})

function readApi(ctx) {
	try { return ctx.get("apiProxy") } catch { return undefined }
}

export function apply(ctx, config = {}) {
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
			const store = createStore(config.root ?? "D:/dsh-workbench/messenger")
			const getApi = () => readApi(ctx)
			const getLlm = () => {
				try { return ctx.llm } catch { return undefined }
			}
			const sidecar = config.sidecar ?? createSidecar({
				env: {
					...process.env,
					DSH_MESSENGER: process.env.DSH_MESSENGER ?? "http://127.0.0.1:3080",
					DSH_WX_CONTACT: config.contact ?? process.env.DSH_WX_CONTACT ?? "黄山",
					DSH_WX_CONFIG: `${config.root ?? "D:/dsh-workbench/messenger"}/config.json`.replace(/\\/g, "/"),
				},
			})
			const stopDesk = registerDesk(webServer, { ...config, store, sidecar, getLlm }, getApi)
			const stopWatch = watchTurns(ctx, store, (item, reason, session) => finishTurn(store, item, reason, { session }))
			const autoStart = startSidecarWhenReady(store, sidecar)
			return () => {
				autoStart.dispose()
				sidecar.stop()
				stopWatch?.()
				stopDesk?.()
			}
		}, "dsh-messenger.desk")
	}
	registerWebSurface()
	ctx.on("internal/service", (serviceName) => {
		if (WEB_SERVER_KEYS.includes(serviceName)) registerWebSurface()
	})
	ctx.on("ready", () => {
		registerWebSurface()
		if (!webSurfaceRegistered) ctx.logger?.warn?.("[dsh-messenger] 未找到 webServer/httpServer 服务，工作台 UI 未挂载")
	})
}
