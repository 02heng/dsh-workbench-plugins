/* PhotoCraft 工作台前端：原生 JS，无外部依赖 */
const BASE = "/plugins/dsh-photocraft"
const KIND_LABELS = { dewatermark: "去水印", cutout: "抠图", paint: "画笔" }

const state = {
	images: [],
	kind: "dewatermark",
	running: false,
	jobId: "",
	outDir: "",
	timer: 0,
	toastTimer: 0,
}

const $ = (selector, root) => (root || document).querySelector(selector)
const $$ = (selector, root) => Array.prototype.slice.call((root || document).querySelectorAll(selector))

function el(tag, className, text) {
	const node = document.createElement(tag)
	if (className) node.className = className
	if (text !== undefined && text !== null) node.textContent = String(text)
	return node
}

function toast(message, tone) {
	const node = $("#toast")
	if (!node) return
	node.textContent = String(message)
	node.hidden = false
	node.className = "toast is-show" + (tone ? " is-" + tone : "")
	window.clearTimeout(state.toastTimer)
	state.toastTimer = window.setTimeout(function () {
		node.classList.remove("is-show")
		node.hidden = true
	}, tone === "bad" ? 5200 : 3000)
}

async function api(path, init) {
	const response = await fetch(BASE + path, init)
	const text = await response.text()
	let data = {}
	try {
		data = text ? JSON.parse(text) : {}
	} catch (error) {
		data = { error: text.slice(0, 240) }
	}
	if (!response.ok) {
		throw new Error((data && data.error) || "请求失败 HTTP " + response.status)
	}
	return data
}

/* ---------- 环境状态 ---------- */

function paintPill(which, info) {
	const pill = $("#" + which + "-pill")
	const text = $("#" + which + "-text")
	if (!pill || !text) return
	const ok = Boolean(info && info.ok)
	const hasError = Boolean(info && info.error)
	pill.classList.toggle("is-ok", ok)
	pill.classList.toggle("is-bad", !ok && hasError)
	pill.classList.toggle("is-warn", !ok && !hasError)
	if (which === "cli") {
		text.textContent = ok ? "CLI " + (info.version || "就绪") : "CLI 不可用"
	} else {
		text.textContent = ok ? "Python 就绪" : "Python 不可用"
	}
	pill.title = ok ? String(info.path || info.version || "") : String((info && info.error) || "")
}

async function loadStatus() {
	try {
		const status = await api("/api/status")
		paintPill("cli", status.cli)
		paintPill("py", status.python)
		if (status.dirs && status.dirs.out) state.defaultOut = status.dirs.out
	} catch (error) {
		paintPill("cli", { ok: false, error: error.message })
		paintPill("py", { ok: false, error: error.message })
	}
}

/* ---------- 上传 ---------- */

function formatBytes(size) {
	const value = Number(size) || 0
	if (value < 1024) return value + " B"
	if (value < 1024 * 1024) return (value / 1024).toFixed(1) + " KB"
	return (value / 1024 / 1024).toFixed(2) + " MB"
}

function isImageFile(file) {
	if (!file) return false
	if (file.type && file.type.indexOf("image/") === 0) return true
	return /\.(png|jpe?g|webp|bmp|tiff?|gif|psd)$/i.test(file.name || "")
}

async function addFiles(fileList) {
	const files = Array.prototype.slice.call(fileList || [])
	if (!files.length) return
	const drop = $("#drop")
	drop.classList.add("is-busy")
	const title = $(".drop-title", drop)
	const previous = title.textContent
	title.textContent = "上传中…"
	let added = 0
	for (const file of files) {
		if (!isImageFile(file)) {
			toast("跳过非图片文件：" + file.name, "bad")
			continue
		}
		try {
			const form = new FormData()
			form.append("file", file)
			const item = await api("/api/upload", { method: "POST", body: form })
			if (item && item.id) {
				state.images.push(item)
				added += 1
			}
		} catch (error) {
			toast(file.name + " 上传失败：" + error.message, "bad")
		}
	}
	title.textContent = previous
	drop.classList.remove("is-busy")
	if (added) {
		renderThumbs()
		toast("已加入 " + added + " 张图片", "ok")
	}
	syncRun()
}

function renderThumbs() {
	const box = $("#thumbs")
	box.textContent = ""
	box.hidden = state.images.length === 0
	for (const item of state.images) {
		const card = el("div", "thumb")
		const img = el("img")
		img.src = item.url || ""
		img.alt = item.name || "图片"
		img.loading = "lazy"
		const body = el("div", "thumb-body")
		body.appendChild(el("div", "thumb-name", item.name || "image"))
		body.appendChild(el("div", "thumb-meta", formatBytes(item.size)))
		const del = el("button", "thumb-del", "×")
		del.type = "button"
		del.title = "移除这张图片"
		del.addEventListener("click", function (event) {
			event.stopPropagation()
			state.images = state.images.filter((entry) => entry !== item)
			renderThumbs()
			syncRun()
		})
		card.appendChild(img)
		card.appendChild(body)
		card.appendChild(del)
		box.appendChild(card)
	}
}

/* ---------- 功能选择 ---------- */

function selectKind(kind) {
	if (!KIND_LABELS[kind]) return
	state.kind = kind
	$$(".kind").forEach(function (card) {
		const active = card.getAttribute("data-kind") === kind
		card.classList.toggle("is-active", active)
		card.setAttribute("aria-pressed", active ? "true" : "false")
	})
	syncRun()
}

function syncRun() {
	const run = $("#run")
	const cancel = $("#cancel")
	const meta = $("#runmeta")
	if (!run) return
	const count = state.images.length
	run.disabled = state.running || count === 0
	run.textContent = state.running
		? "处理中…"
		: count
			? "开始处理 · " + count + " 张 · " + KIND_LABELS[state.kind]
			: "开始处理"
	cancel.hidden = !state.running
	meta.textContent = count ? count + " 张图片 · " + KIND_LABELS[state.kind] : "还没有选择图片"
}

function formatOut(name, value) {
	if (name === "density") return Number(value).toFixed(1)
	if (name === "jitter") return Number(value).toFixed(2)
	return String(Math.round(Number(value)))
}

function syncOutValues(root) {
	$$("[data-out]", root || document).forEach(function (node) {
		if (node.tagName === "INPUT") return
		const name = node.getAttribute("data-out")
		const input = $('input[name="' + name + '"]', root || document)
		if (input) node.textContent = formatOut(name, input.value)
	})
}

function collectOptions(kind) {
	const card = $('.kind[data-kind="' + kind + '"]')
	const options = {}
	if (!card) return options
	$$("input,select", card).forEach(function (node) {
		const name = node.getAttribute("name")
		if (!name) return
		if (node.type === "checkbox") options[name] = node.checked
		else if (node.type === "range" || node.type === "number") options[name] = Number(node.value)
		else options[name] = node.value
	})
	return options
}

/* ---------- 运行与进度 ---------- */

function showProgress() {
	$("#progress").hidden = false
}

function setProgress(percent, total, label, detail, bad) {
	const fill = $("#progress-fill")
	const pct = Math.max(0, Math.min(100, Number(percent) || 0))
	fill.style.width = pct + "%"
	$("#progress-pct").textContent = pct + "%"
	$("#progress-label").textContent = label || "处理中…"
	const note = $("#progress-note")
	const parts = []
	if (typeof total === "number" && total > 0) parts.push("共 " + total + " 张")
	if (detail) parts.push(detail)
	note.textContent = parts.join(" · ")
	note.classList.toggle("is-bad", Boolean(bad))
}

async function startRun() {
	if (state.running || state.images.length === 0) return
	state.running = true
	syncRun()
	showProgress()
	setProgress(0, state.images.length, "已提交任务…", "")
	$("#results-step").hidden = true
	try {
		const payload = {
			kind: state.kind,
			files: state.images.map(function (item) {
				return { id: item.id, path: item.path }
			}),
			options: collectOptions(state.kind),
		}
		const job = await api("/api/run", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(payload),
		})
		state.jobId = job.jobId
		state.outDir = job.outDir || ""
		setProgress(0, job.total, "0 / " + job.total, "")
		poll()
	} catch (error) {
		state.running = false
		syncRun()
		setProgress(0, 0, "启动失败：" + error.message, "", true)
		toast("启动失败：" + error.message, "bad")
	}
}

async function poll() {
	if (!state.jobId) return
	let job = null
	try {
		job = await api("/api/job?id=" + encodeURIComponent(state.jobId))
	} catch (error) {
		state.running = false
		syncRun()
		setProgress(0, 0, "任务查询失败：" + error.message, "", true)
		return
	}
	const percent = job.total ? Math.round((job.done / job.total) * 100) : 0
	const running = job.state === "running"
	setProgress(percent, job.total, job.done + " / " + job.total + (running ? " 处理中" : " 已完成"), job.current || "")
	if (running) {
		state.timer = window.setTimeout(poll, 700)
		return
	}
	finish(job)
}

function finish(job) {
	state.running = false
	syncRun()
	const results = Array.isArray(job.results) ? job.results : []
	const okCount = results.filter((item) => item.ok).length
	const failed = results.length - okCount
	const percent = job.total ? Math.round((job.done / job.total) * 100) : 100
	if (failed > 0 && okCount === 0) {
		setProgress(percent, job.total, "失败：" + (job.error || "全部图片处理失败"), "", true)
		toast("处理失败：" + (job.error || "全部图片处理失败"), "bad")
	} else {
		setProgress(100, job.total, "完成 " + okCount + " 张" + (failed ? "，失败 " + failed + " 张" : ""), "", false)
		toast("处理完成：" + okCount + " 张" + (failed ? "，失败 " + failed : ""), "ok")
	}
	renderResults(job)
	if (job.outDir) setOutDir(job.outDir)
}

/* ---------- 结果 ---------- */

function setOutDir(path) {
	state.outDir = path || state.outDir
	const node = $("#outdir-path")
	if (node) {
		node.textContent = state.outDir || "—"
		node.title = state.outDir || ""
	}
}

function chip(label, value) {
	const node = el("span", "chip")
	node.appendChild(el("b", "", label + " "))
	node.appendChild(document.createTextNode(String(value)))
	return node
}

function buildCompare(before, after) {
	const wrap = el("div", "cmp-wrap")
	const box = el("div", "compare")
	box.style.setProperty("--pos", "50%")

	const imgBefore = el("img", "cmp-before")
	imgBefore.src = before
	imgBefore.alt = "原图"
	imgBefore.loading = "lazy"

	const imgAfter = el("img", "cmp-after")
	imgAfter.src = after
	imgAfter.alt = "结果"
	imgAfter.loading = "lazy"

	const grip = el("div", "cmp-grip")
	box.appendChild(imgBefore)
	box.appendChild(imgAfter)
	box.appendChild(grip)
	box.appendChild(el("span", "cmp-tag cmp-tag-left", "原图"))
	box.appendChild(el("span", "cmp-tag cmp-tag-right", "结果"))

	const range = el("input", "cmp-range")
	range.type = "range"
	range.min = "0"
	range.max = "100"
	range.step = "1"
	range.value = "50"
	range.setAttribute("aria-label", "前后对比位置")

	function update(value) {
		box.style.setProperty("--pos", value + "%")
	}

	range.addEventListener("input", function () {
		update(range.value)
	})

	function drag(event) {
		const rect = box.getBoundingClientRect()
		if (!rect.width) return
		const pct = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100))
		range.value = String(Math.round(pct))
		update(range.value)
	}

	box.addEventListener("pointerdown", function (event) {
		if (event.button !== 0) return
		box.setPointerCapture(event.pointerId)
		drag(event)
	})
	box.addEventListener("pointermove", function (event) {
		if (!box.hasPointerCapture(event.pointerId)) return
		drag(event)
	})

	wrap.appendChild(box)
	wrap.appendChild(range)
	return wrap
}

function buildResult(item, job) {
	const card = el("article", "result")
	const head = el("div", "result-head")
	head.appendChild(el("span", "result-name", item.name || "图片"))
	head.appendChild(el("span", "badge" + (item.ok ? "" : " is-bad"), item.ok ? "完成" : "失败"))
	card.appendChild(head)

	const chips = el("div", "chips")
	const meta = item.meta && typeof item.meta === "object" ? item.meta : {}
	if (meta.seconds !== undefined) chips.appendChild(chip("耗时", Number(meta.seconds).toFixed(2) + "s"))
	if (meta.strokes !== undefined) chips.appendChild(chip("笔触", meta.strokes))
	if (Array.isArray(meta.bbox)) chips.appendChild(chip("bbox", meta.bbox.join(", ")))
	if (Array.isArray(meta.bounds)) chips.appendChild(chip("bounds", meta.bounds.join(", ")))
	if (meta.confidence !== undefined) chips.appendChild(chip("置信度", Number(meta.confidence).toFixed(2)))
	if (meta.error) chips.appendChild(chip("错误", meta.error))
	if (chips.childNodes.length) card.appendChild(chips)

	if (item.url && item.sourceUrl) {
		card.appendChild(buildCompare(item.sourceUrl, item.url))
	} else {
		const missing = el("div", "compare is-missing")
		missing.appendChild(el("span", "chip", meta.error || "没有可预览的输出"))
		card.appendChild(missing)
	}

	const actions = el("div", "actions")
	if (item.url) {
		const download = el("a", "btn btn-small", "下载")
		download.href = item.url + "&download=1"
		download.setAttribute("download", item.name || "output")
		actions.appendChild(download)

		const open = el("a", "btn btn-small btn-ghost", "新窗口打开")
		open.href = item.url
		open.target = "_blank"
		open.rel = "noopener"
		actions.appendChild(open)
	}
	actions.appendChild(el("span", "spacer"))
	const copy = el("button", "btn btn-small btn-ghost", "复制路径")
	copy.type = "button"
	copy.addEventListener("click", function () {
		copyText(item.output || job.outDir || state.outDir)
	})
	actions.appendChild(copy)
	card.appendChild(actions)
	return card
}

function renderResults(job) {
	const box = $("#results")
	const step = $("#results-step")
	box.textContent = ""
	const results = Array.isArray(job.results) ? job.results : []
	if (!results.length) {
		step.hidden = true
		return
	}
	step.hidden = false
	const okCount = results.filter((item) => item.ok).length
	$("#results-hint").textContent =
		KIND_LABELS[job.kind] + " · " + results.length + " 张 · 成功 " + okCount
	for (const item of results) box.appendChild(buildResult(item, job))
}

function copyText(text) {
	const value = String(text || "")
	if (!value) return
	const done = function () { toast("已复制路径", "ok") }
	if (navigator.clipboard && navigator.clipboard.writeText) {
		navigator.clipboard.writeText(value).then(done).catch(function () { fallbackCopy(value, done) })
	} else {
		fallbackCopy(value, done)
	}
}

function fallbackCopy(value, done) {
	const area = document.createElement("textarea")
	area.value = value
	area.style.position = "fixed"
	area.style.opacity = "0"
	document.body.appendChild(area)
	area.select()
	try {
		document.execCommand("copy")
		done()
	} catch (error) {
		toast("复制失败，请手动选择路径", "bad")
	}
	document.body.removeChild(area)
}

/* ---------- 事件绑定 ---------- */

function bind() {
	const drop = $("#drop")
	const picker = $("#picker")

	drop.addEventListener("click", function () { picker.click() })
	drop.addEventListener("keydown", function (event) {
		if (event.key === "Enter" || event.key === " ") {
			event.preventDefault()
			picker.click()
		}
	})
	picker.addEventListener("change", function () {
		addFiles(picker.files)
		picker.value = ""
	})

	drop.addEventListener("dragover", function (event) {
		event.preventDefault()
		drop.classList.add("is-over")
	})
	drop.addEventListener("dragleave", function () { drop.classList.remove("is-over") })
	drop.addEventListener("drop", function (event) {
		event.preventDefault()
		drop.classList.remove("is-over")
		if (event.dataTransfer && event.dataTransfer.files) addFiles(event.dataTransfer.files)
	})
	document.addEventListener("dragover", function (event) { event.preventDefault() })
	document.addEventListener("drop", function (event) {
		if (event.target && event.target.closest && event.target.closest("#drop")) return
		event.preventDefault()
		if (event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files.length) {
			addFiles(event.dataTransfer.files)
		}
	})

	document.addEventListener("paste", function (event) {
		const items = event.clipboardData && event.clipboardData.items
		if (!items) return
		const files = []
		for (const item of items) {
			if (item.kind !== "file") continue
			const file = item.getAsFile()
			if (file) files.push(file)
		}
		if (files.length) {
			event.preventDefault()
			addFiles(files)
		}
	})

	$$(".kind").forEach(function (card) {
		card.addEventListener("click", function (event) {
			if (event.target && event.target.closest && event.target.closest(".fields")) {
				// 点参数区也要选中该卡片，但不打断控件本身的操作
			}
			selectKind(card.getAttribute("data-kind"))
		})
		card.addEventListener("keydown", function (event) {
			if (event.target !== card) return
			if (event.key === "Enter" || event.key === " ") {
				event.preventDefault()
				selectKind(card.getAttribute("data-kind"))
			}
		})
	})

	$$('input[type="range"]').forEach(function (input) {
		input.addEventListener("input", function () {
			const name = input.getAttribute("data-out")
			if (!name) return
			const out = $('[data-out="' + name + '"]:not(input)')
			if (out) out.textContent = formatOut(name, input.value)
		})
	})

	$("#run").addEventListener("click", startRun)
	$("#cancel").addEventListener("click", async function () {
		if (!state.jobId) return
		try {
			await api("/api/job/cancel", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ id: state.jobId }),
			})
			toast("已请求取消", "ok")
		} catch (error) {
			toast("取消失败：" + error.message, "bad")
		}
	})
	$("#clear").addEventListener("click", function () {
		if (state.running) {
			toast("正在处理，先取消再清空", "bad")
			return
		}
		state.images = []
		renderThumbs()
		syncRun()
		$("#results-step").hidden = true
		$("#results").textContent = ""
	})
	$("#open-dir").addEventListener("click", async function () {
		const target = state.outDir || (state.defaultOut || "")
		try {
			await api("/api/open-dir", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ path: target }),
			})
			toast("已打开输出目录", "ok")
		} catch (error) {
			toast("打开失败：" + error.message, "bad")
		}
	})
}

function boot() {
	bind()
	syncOutValues()
	syncRun()
	loadStatus()
}

if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", boot)
} else {
	boot()
}
