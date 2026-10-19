(function mountCraftChips() {
	if (window.__dshCraftDockMounted) return
	window.__dshCraftDockMounted = true

	var MODES = [
		{ id: "ask", label: "问一问", hint: "只答，不改文件、不发微信" },
		{ id: "plan", label: "想一想", hint: "先出做法，点选后才写" },
		{ id: "craft", label: "做一做", hint: "可以写文件、发微信" },
	]
	var EXPERTS = [
		{ id: "official", label: "公文", hint: "文号、主送、落款" },
		{ id: "thesis", label: "课题", hint: "先对材料，不编数据" },
		{ id: "duty", label: "值班", hint: "只记已发生的事" },
	]
	var css = [
		"#dsh-craft-dock-host.dsh-craft-dock{position:fixed;z-index:80;display:inline-flex;flex-wrap:wrap;gap:4px;align-items:center;pointer-events:auto;max-width:420px;}",
		"#dsh-craft-dock-host[hidden]{display:none!important;}",
		".dsh-craft-chip{appearance:none;border:1px solid #d8cfc0;background:#fffdf8;color:#0f5c56;border-radius:999px;padding:4px 9px;cursor:pointer;white-space:nowrap;font:500 11px/1.2 'IBM Plex Sans','Noto Sans SC',sans-serif;transition:transform .14s ease,background .14s ease;}",
		".dsh-craft-chip:hover{background:#d8ebe6;}",
		".dsh-craft-chip:active{transform:scale(.98);}",
		".dsh-craft-chip:focus-visible{outline:2px solid #0f5c56;outline-offset:2px;}",
		".dsh-craft-chip.is-on{background:#0f5c56;color:#f7fffc;border-color:#0f5c56;}",
		".dsh-craft-sep{width:1px;height:14px;background:#d8cfc0;margin:0 2px;flex:0 0 1px;}",
	].join("")

	if (!document.getElementById("dsh-craft-dock-css")) {
		var style = document.createElement("style")
		style.id = "dsh-craft-dock-css"
		style.textContent = css
		document.head.appendChild(style)
	}

	var host = document.createElement("div")
	host.id = "dsh-craft-dock-host"
	host.className = "dsh-craft-dock"
	host.setAttribute("aria-label", "对话工作档")
	var snap = { mode: "craft", expert: "none" }

	function paint() {
		host.innerHTML = MODES.map(function (item) {
			return "<button type=\"button\" class=\"dsh-craft-chip" + (snap.mode === item.id ? " is-on" : "") + "\" data-craft-mode=\"" + item.id + "\" title=\"" + item.hint + "\">" + item.label + "</button>"
		}).join("")
			+ "<span class=\"dsh-craft-sep\" aria-hidden=\"true\"></span>"
			+ EXPERTS.map(function (item) {
				return "<button type=\"button\" class=\"dsh-craft-chip" + (snap.expert === item.id ? " is-on" : "") + "\" data-craft-expert=\"" + item.id + "\" title=\"" + item.hint + "\">" + item.label + "</button>"
			}).join("")
	}

	function post(path, body) {
		return fetch(path, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
		}).then(function (res) { return res.json() })
	}

	paint()
	host.addEventListener("mousedown", function (event) { event.preventDefault() })
	host.addEventListener("click", function (event) {
		var btn = event.target && event.target.closest && event.target.closest("button")
		if (!btn || !host.contains(btn)) return
		event.preventDefault()
		event.stopPropagation()
		var mode = btn.getAttribute("data-craft-mode")
		var expert = btn.getAttribute("data-craft-expert")
		var req = mode
			? post("/plugins/dsh-dashboard/craft-mode", { mode: mode })
			: post("/plugins/dsh-dashboard/craft-expert", { expert: snap.expert === expert ? "none" : expert })
		req.then(function (data) {
			if (!data || data.error) return
			snap = { mode: data.mode || snap.mode, expert: data.expert || "none" }
			paint()
		}).catch(function () {})
	})
	fetch("/plugins/dsh-dashboard/craft-state").then(function (res) { return res.json() }).then(function (data) {
		if (!data || !data.mode) return
		snap = { mode: data.mode, expert: data.expert || "none" }
		paint()
	}).catch(function () {})

	function visibleSeat() {
		var seats = document.querySelectorAll("[data-composer-seat]")
		for (var i = 0; i < seats.length; i++) {
			var rect = seats[i].getBoundingClientRect()
			if (rect.height > 24 && rect.width > 200) return seats[i]
		}
		return null
	}

	function toolRow(seat) {
		var file = seat.querySelector("input[type='file']")
		if (file && file.parentElement) return file.parentElement
		var plus = seat.querySelector("button[aria-haspopup='listbox']")
		return plus && plus.parentElement
	}

	var placeTries = 0
	function attach() {
		if (document.documentElement.getAttribute("data-workbench") || document.documentElement.getAttribute("data-composer-drawer") === "in") {
			host.hidden = true
			return
		}
		var seat = visibleSeat()
		var tools = seat && toolRow(seat)
		if (!seat || !tools) {
			host.hidden = true
			if (placeTries < 40) {
				placeTries += 1
				window.setTimeout(attach, 250)
			}
			return
		}
		placeTries = 0
		if (host.parentElement !== document.body) document.body.appendChild(host)
		host.hidden = false
		var toolsRect = tools.getBoundingClientRect()
		var trailing = tools.nextElementSibling
		var trailingRect = trailing ? trailing.getBoundingClientRect() : { left: toolsRect.right + 360 }
		var gap = Math.max(180, trailingRect.left - toolsRect.right - 12)
		host.style.maxWidth = Math.min(420, gap) + "px"
		var height = host.offsetHeight || 22
		host.style.top = Math.round(toolsRect.top + (toolsRect.height - height) / 2) + "px"
		host.style.left = Math.round(toolsRect.right + 8) + "px"
	}

	var timer = 0
	function schedule() {
		if (timer) window.clearTimeout(timer)
		timer = window.setTimeout(attach, 40)
	}
	window.__dshPlaceCraftDock = schedule
	var observer = new MutationObserver(function (mutations) {
		if (mutations.every(function (mutation) {
			var node = mutation.target
			var el = node && node.nodeType === 1 ? node : node && node.parentElement
			return Boolean(el && el.closest && el.closest("#dsh-craft-dock-host"))
		})) return
		schedule()
	})
	observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-workbench", "data-composer-drawer"] })
	window.addEventListener("dsh-tab-change", schedule)
	window.addEventListener("resize", schedule)
	document.addEventListener("scroll", schedule, true)
	attach()
})()
