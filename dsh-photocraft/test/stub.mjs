// pc-verify: @deepseek-ai/* 的通用 stub，只为让 lib/index.js 能 import 成功。
// 参考 D:/dsh-workbench/tmp/probe-webkey/stub.mjs，补了 symbol/ then 保护。
const anyProxy = new Proxy(function () {}, {
	get(_t, key) {
		if (key === "__esModule") return true
		if (key === "then") return undefined
		if (typeof key === "symbol") return undefined
		return anyProxy
	},
	apply() { return anyProxy },
	construct() { return anyProxy },
})

export default anyProxy
export const defineTool = (def) => def
export const Service = class {}
export const Context = class {}
export const Schema = anyProxy
export const z = anyProxy
export const Http = anyProxy
export const HttpServer = anyProxy
export const WebServer = anyProxy
export const inject = () => anyProxy
export const Config = anyProxy
