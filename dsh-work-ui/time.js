export function ledgerDay(value = new Date()) {
	const date = value instanceof Date ? value : new Date(value)
	if (Number.isNaN(date.getTime())) return ""
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: "Asia/Shanghai",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(date)
	const year = parts.find((part) => part.type === "year")?.value
	const month = parts.find((part) => part.type === "month")?.value
	const day = parts.find((part) => part.type === "day")?.value
	return year && month && day ? `${year}-${month}-${day}` : ""
}

export function formatBeijingTime(value, { seconds = true } = {}) {
	const date = value instanceof Date ? value : new Date(value)
	if (Number.isNaN(date.getTime())) return ""
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: "Asia/Shanghai",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hourCycle: "h23",
	}).formatToParts(date)
	const get = (type) => parts.find((part) => part.type === type)?.value ?? ""
	const clock = seconds
		? `${get("hour")}:${get("minute")}:${get("second")}`
		: `${get("hour")}:${get("minute")}`
	return `${get("year")}-${get("month")}-${get("day")} ${clock}`
}
