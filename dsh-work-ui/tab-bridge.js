import { isLiveListenTab } from "./lazy-tab.js"

export function shouldKeepListen(tabName) {
	return isLiveListenTab(tabName)
}
