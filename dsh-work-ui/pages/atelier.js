const { createElement: h } = window.React

const TITLES = {
	book: "书籍转技能",
	trail: "轨迹",
	memory: "记忆",
	skills: "技能",
	todos: "待办",
}

export function AtelierPage({ page, active }) {
	const src = `/plugins/dsh-dashboard/atelier?page=${encodeURIComponent(page)}#/${page}`
	return h("div", { className: "atelier-embed" },
		h("iframe", {
			src,
			title: TITLES[page] || page,
			className: "atelier-frame",
			hidden: !active,
		}),
	)
}
