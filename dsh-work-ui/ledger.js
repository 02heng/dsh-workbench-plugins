export function itemsFingerprint(items) {
	return JSON.stringify((items || []).map((item) => [
		item.id, item.status, item.title, item.text, item.at, item.action,
	]))
}

export function shouldFetch(routeName, pageName) {
	return routeName === pageName
}
