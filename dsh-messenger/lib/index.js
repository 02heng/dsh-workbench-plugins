import z from "@deepseek-ai/schemastery"
import { finishTurn, watchTurns } from "./dispatch.js"
import { registerDesk } from "./http.js"
import { createSidecar, startSidecarWhenReady } from "./sidecar.js"
import { createStore } from "./store.js"

export const name = "dsh-messenger"
export const inject = []
export const Config = z.object({
	root: z.string().default("D:/dsh-workbench/messenger"),
	cwd: z.string().default("D:/dsh-workbench"),
	contact: z.string().default("黄山"),
})

function readApi(ctx) {
	try { return ctx.get("apiProxy") } catch { return undefined }
}

export function apply(ctx, config = {}) {
	ctx.inject(["webServer", "apiProxy"], (webCtx) => {
		webCtx.effect(() => {
			const webServer = webCtx.webServer
			if (webServer === undefined) return () => {}
			const store = createStore(config.root ?? "D:/dsh-workbench/messenger")
			const getApi = () => webCtx.apiProxy ?? readApi(webCtx) ?? readApi(ctx)
			const sidecar = config.sidecar ?? createSidecar({
				env: {
					...process.env,
					DSH_MESSENGER: process.env.DSH_MESSENGER ?? "http://127.0.0.1:3080",
					DSH_WX_CONTACT: config.contact ?? process.env.DSH_WX_CONTACT ?? "黄山",
				},
			})
			const stopDesk = registerDesk(webServer, { ...config, store, sidecar }, getApi)
			const stopWatch = watchTurns(ctx, store, (item, reason) => finishTurn(store, item, reason))
			const autoStart = startSidecarWhenReady(store, sidecar)
			return () => {
				autoStart.dispose()
				sidecar.stop()
				stopWatch?.()
				stopDesk?.()
			}
		}, "dsh-messenger.desk")
	})
}
