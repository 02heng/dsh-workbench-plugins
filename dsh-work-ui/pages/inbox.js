import { postJson, useArmed, useToast } from "./ui.js"

const { createElement: h, useEffect, useRef, useState } = window.React

export function InboxPage({ active }) {
	const [docs, setDocs] = useState([])
	const [files, setFiles] = useState([])
	const [toKb, setToKb] = useState(false)
	const [collection, setCollection] = useState("notes")
	const [over, setOver] = useState(false)
	const input = useRef(null)
	const { say, node: toast } = useToast()
	const { armed, arm } = useArmed(3200)

	const load = async () => {
		const res = await fetch("/plugins/dsh-docs/api/list")
		const data = await res.json()
		setDocs(data.docs || data.items || data || [])
	}

	useEffect(() => {
		if (!active) return undefined
		let alive = true
		load().catch(() => { if (alive) say("知识库列表读失败", false) })
		return () => { alive = false }
	}, [active])

	const sendFiles = async (list) => {
		const bag = [...list]
		if (!bag.length) return
		setFiles(bag)
		try {
			for (let i = 0; i < bag.length; i++) {
				say(`正在解析 ${i + 1}/${bag.length} · ${bag[i].name}`)
				const data = new FormData()
				data.append("file", bag[i])
				data.append("toKb", toKb ? "1" : "0")
				data.append("collection", collection)
				const res = await fetch("/plugins/dsh-docs/api/upload", { method: "POST", body: data })
				const json = await res.json()
				if (json.error) throw new Error(json.error)
			}
			say(`已解析 ${bag.length} 份`)
			await load()
		} catch (error) { say(error.message, false) }
	}

	return h("div", { className: "wrap" },
		h("p", { className: "kicker" }, "Knowledge atelier"),
		h("h1", null, "知识库"),
		h("p", { className: "lede" }, "文稿解析后可入库。原件在 D:\\dsh-workbench\\docs，条文在 D:\\dsh-kb。"),
		h("div", { className: "card" },
			h("div", {
				id: "drop",
				className: `drop${over ? " over" : ""}`,
				role: "button",
				tabIndex: 0,
				"aria-label": "选取或拖入文档",
				onClick: () => input.current?.click(),
				onKeyDown: (event) => {
					if (event.key === "Enter" || event.key === " ") {
						event.preventDefault()
						input.current?.click()
					}
				},
				onDragOver: (event) => { event.preventDefault(); setOver(true) },
				onDragLeave: () => setOver(false),
				onDrop: (event) => {
					event.preventDefault()
					setOver(false)
					sendFiles(event.dataTransfer.files)
				},
			},
				h("input", {
					ref: input,
					type: "file",
					multiple: true,
					accept: ".docx,.xlsx,.pptx,.pdf,.txt,.md,.csv,.json,.png,.jpg,.jpeg,.webp,.gif,.bmp,image/*",
					onChange: (event) => sendFiles(event.target.files),
					onClick: (event) => event.stopPropagation(),
				}),
				h("div", { className: "drop-mark" }, "+"),
				h("p", { className: "drop-title" }, "把文稿或截图放进来"),
				h("p", { className: "drop-sub" }, "拖拽到这里，或点击选取。图片走视觉解析，一次可多份。"),
				h("span", { className: "btn btn-primary", onClick: (event) => { event.stopPropagation(); input.current?.click() } }, "选取文稿"),
				h("div", { className: "drop-names" },
					files.length === 0
						? "尚未选取"
						: files.map((file) => h("span", { key: file.name, className: "file-chip" }, `${file.name} · ${Math.max(1, Math.round(file.size / 1024))} KB`)),
				),
			),
			h("div", { className: "row" },
				h("label", null,
					h("input", { type: "checkbox", checked: toKb, onChange: (e) => setToKb(e.target.checked) }),
					" 解析后写入知识库备忘",
				),
				h("select", { value: collection, onChange: (e) => setCollection(e.target.value) },
					h("option", { value: "notes" }, "notes 备忘"),
					h("option", { value: "policies" }, "policies 制度"),
					h("option", { value: "dictionary" }, "dictionary 字典"),
					h("option", { value: "recipes" }, "recipes 口径"),
				),
			),
			h("p", { className: "hint" }, "支持 Word / Excel / PPT / PDF / 文本，以及 png jpg webp gif 截图。单文件不超过 20MB。"),
		),
		toast,
		h("div", { className: "card" },
			h("h2", null, "已解析文档"),
			h("div", { className: "paper-scroll", tabIndex: 0, "aria-label": "已解析文档" },
				h("table", null,
					h("thead", null, h("tr", null,
						h("th", null, "文件"), h("th", null, "类型"), h("th", null, "时间"),
						h("th", null, "字数"), h("th", null, "知识库"), h("th", null, ""),
					)),
					h("tbody", null,
						docs.length === 0
							? h("tr", null, h("td", { colSpan: 6 }, "还没有文稿。把 Word / Excel / PPT / PDF / 截图拖到上面。"))
							: docs.map((item) => h("tr", { key: item.id },
								h("td", null, item.name),
								h("td", null, item.kind),
								h("td", null, String(item.uploadedAt || "").replace("T", " ").slice(0, 19)),
								h("td", null, `${item.chars ?? 0}${item.truncated ? "（已截断）" : ""}`),
								h("td", null, item.toKb ? item.kbPath : "未入库"),
								h("td", { className: "actions" },
									h("button", {
										type: "button",
										className: "btn-soft",
										onClick: async () => {
											try {
												await postJson("/plugins/dsh-docs/api/to-kb", { id: item.id, collection })
												say("已入库")
												await load()
											} catch (error) { say(error.message, false) }
										},
									}, item.toKb ? "已入库" : "入知识库"),
									h("button", {
										type: "button",
										className: `btn-danger${armed === item.id ? " is-armed" : ""}`,
										onClick: async () => {
											if (!arm(item.id)) { say(`再点一次确认移除「${item.name}」`); return }
											try {
												await postJson("/plugins/dsh-docs/api/delete", { id: item.id })
												say("已移除")
												await load()
											} catch (error) { say(error.message, false) }
										},
									}, armed === item.id ? "确认删除" : "移除"),
								),
							)),
					),
				),
			),
		),
	)
}
