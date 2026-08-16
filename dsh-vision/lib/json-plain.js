export function toToolValue(value) {
	return JSON.parse(JSON.stringify(value, (_key, item) => (item === undefined ? undefined : item)))
}
