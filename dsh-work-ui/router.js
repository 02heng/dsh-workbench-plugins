export const TAB_ROUTES = [
	{ tab: "信使", path: "#/desk", name: "desk" },
	{ tab: "知识库", path: "#/inbox", name: "inbox" },
	{ tab: "循环任务", path: "#/board", name: "board" },
	{ tab: "数据大屏", path: "#/wall", name: "wall" },
	{ tab: "书籍转技能", path: "#/atelier/book", name: "atelier", page: "book" },
	{ tab: "轨迹", path: "#/atelier/trail", name: "atelier", page: "trail" },
	{ tab: "记忆", path: "#/atelier/memory", name: "atelier", page: "memory" },
	{ tab: "技能", path: "#/atelier/skills", name: "atelier", page: "skills" },
	{ tab: "待办", path: "#/atelier/todos", name: "atelier", page: "todos" },
]

function cleanTab(name) {
	return String(name || "").replace(/[×✕]/g, "").replace(/\(\d+\)/g, "").replace(/\s+/g, " ").trim()
}

export function routeFromTab(name) {
	const label = cleanTab(name)
	if (!label || label === "对话") return { name: "host", path: "" }
	const exact = TAB_ROUTES.find((row) => row.tab === label)
	if (exact) return { name: exact.name, path: exact.path, page: exact.page }
	const prefix = TAB_ROUTES.find((row) => label.startsWith(row.tab))
	if (prefix) return { name: prefix.name, path: prefix.path, page: prefix.page }
	return { name: "host", path: "" }
}

export function tabFromPath(path) {
	const hash = String(path || "")
	const hit = TAB_ROUTES.find((row) => row.path === hash)
	return hit ? hit.tab : ""
}

export function parseHash(hash) {
	const raw = String(hash || "")
	const path = raw.startsWith("#") ? raw : `#${raw}`
	const hit = TAB_ROUTES.find((row) => row.path === path)
	if (hit) return { name: hit.name, page: hit.page, path: hit.path }
	const atelier = /^#\/atelier\/([a-z]+)$/.exec(path)
	if (atelier) return { name: "atelier", page: atelier[1], path }
	if (path === "#" || path === "#/" || path === "") return { name: "host", path: "" }
	return { name: "host", path: "" }
}
