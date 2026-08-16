import { formatBeijingTime } from "../time.js"

const { createElement: h, useEffect, useState } = window.React

export function WallPage({ active }) {
	const [state, setState] = useState({ kpis: [], openTasks: [], school: {}, kb: {}, devices: [], pendingDocs: [] })
	const [clock, setClock] = useState("--:--:--")

	useEffect(() => {
		if (!active) return undefined
		let alive = true
		const pull = async () => {
			if (document.visibilityState === "hidden") return
			try {
				const res = await fetch("/plugins/dsh-dashboard/api/state")
				const data = await res.json()
				if (alive) setState(data)
			} catch { /* 下一轮 */ }
		}
		const tick = () => setClock(formatBeijingTime(new Date()).slice(11))
		pull()
		tick()
		const a = setInterval(pull, 8000)
		const b = setInterval(tick, 1000)
		return () => { alive = false; clearInterval(a); clearInterval(b) }
	}, [active])

	const school = state.school || {}
	return h("div", { className: "wall-wrap" },
		h("div", { className: "wall-mast" },
			h("div", null,
				h("p", { className: "kicker" }, "School wall"),
				h("h1", null, school.name || "数据大屏"),
				h("p", { className: "lede" }, `${school.campus || ""} · ${school.term || ""}。台账数字来自本机。`),
			),
			h("div", { className: "wall-clock", "aria-live": "polite" }, clock),
		),
		h("div", { className: "kpi-row" },
			(state.kpis || []).map((item) => h("button", { key: item.id, type: "button", className: "kpi" },
				h("b", null, item.value),
				h("span", null, item.label),
				h("small", null, item.hint),
			)),
		),
		h("div", { className: "wall-grid" },
			h("div", { className: "card" },
				h("h2", null, "未完成任务"),
				h("div", { className: "task-list paper-scroll", tabIndex: 0, "aria-label": "未完成任务" },
					(state.openTasks || []).length === 0
						? h("p", { className: "empty" }, "循环任务都已记过。")
						: (state.openTasks || []).map((item) => h("button", { key: item.id, type: "button", className: `task tone-${item.tone}` },
							h("span", null, h("strong", null, item.title), h("em", null, `${item.every} ${item.at ?? ""}`)),
							h("span", { className: "stamp" }, item.gap),
						)),
				),
			),
			h("div", { className: "card" },
				h("h2", null, "知识库脉搏"),
				h("div", { className: "chips" },
					Object.entries(state.kb?.byCollection || {}).map(([name, count]) => h("span", { key: name, className: "chip" }, `${name} ${count}`)),
				),
				h("ul", { className: "timeline paper-scroll", tabIndex: 0, "aria-label": "知识库近况" },
					(state.kb?.recent || []).length
						? (state.kb.recent || []).map((item, i) => h("li", { key: i }, item.title))
						: h("li", null, "知识库还是空的"),
				),
			),
		),
	)
}
