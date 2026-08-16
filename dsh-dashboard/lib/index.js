import z from "@deepseek-ai/schemastery"
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
	ctx.inject(["webServer"], (webCtx) => {
		webCtx.effect(() => {
			const webServer = webCtx.webServer
			return webServer === undefined ? () => {} : registerWall(webServer, resolved)
		}, "dsh-dashboard.wall")
	})
}
