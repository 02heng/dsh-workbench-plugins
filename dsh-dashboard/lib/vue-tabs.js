const STORE = "dsh.tab-shelf.hidden.v2"
const PINNED = new Set(["对话"])
const STYLE_ID = "dsh-vue-tabs-css"
const HOST_ID = "dsh-vue-tabs-root"
const CATALOG_STORE = "dsh.tab-shelf.catalog.v1"

function cleanName(text) {
	return String(text || "").replace(/[×✕]/g, "").replace(/\s+/g, " ").trim()
}

function isConversationCatalog(rows) {
	return Array.isArray(rows) && rows.some((row) => cleanName(row?.name) === "对话")
}

function normalizeCatalog(rows) {
	const seen = new Set()
	const out = []
	for (const row of rows ?? []) {
		const name = cleanName(row?.name)
		if (!name || seen.has(name)) continue
		seen.add(name)
		out.push({ name, on: Boolean(row.on) })
	}
	return out
}

function mergeCatalog(prev, next) {
	const before = normalizeCatalog(prev)
	const incoming = normalizeCatalog(next)
	if (!incoming.length) return before
	if (!isConversationCatalog(incoming)) return before
	return incoming
}

function loadCatalog() {
	try {
		const raw = JSON.parse(localStorage.getItem(CATALOG_STORE) || "[]")
		return isConversationCatalog(raw) ? normalizeCatalog(raw) : []
	} catch {
		return []
	}
}

function saveCatalog(rows) {
	const next = normalizeCatalog(rows)
	if (!isConversationCatalog(next)) return
	localStorage.setItem(CATALOG_STORE, JSON.stringify(next))
}

const CSS = `
@import url("https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600&family=IBM+Plex+Sans:wght@400;500;600&family=Noto+Sans+SC:wght@400;500;600&display=swap");
html.dsh-vue-tabs-on:not(.dsh-vue-tabs-native):not(.dsh-vue-tabs-idle) header [role="tablist"]:not(.dsh-vue-tablist){
  position:absolute!important;width:1px!important;height:1px!important;
  overflow:hidden!important;clip:rect(0 0 0 0)!important;
  pointer-events:none!important;opacity:0!important;
}
html.dsh-vue-tabs-on:not(.dsh-vue-tabs-native):not(.dsh-vue-tabs-idle) header{padding-bottom:30px;}
html.dsh-vue-tabs-native #dsh-vue-tabs-root .dsh-vue-tab{display:none!important;}
#dsh-vue-tabs-root.dsh-vue-tabs{
  position:fixed;z-index:60;margin:0;padding:0 8px;
  pointer-events:none;height:30px;box-sizing:border-box;
}
#dsh-vue-tabs-root[hidden]{display:none!important;pointer-events:none;}
#dsh-vue-tabs-root .dsh-vue-tablist,
#dsh-vue-tabs-root .dsh-vue-plus,
#dsh-vue-tabs-root .dsh-vue-tab,
#dsh-vue-tabs-root .dsh-vue-x{pointer-events:auto;}
.dsh-vue-tablist{
  display:flex;align-items:flex-end;gap:2px;overflow-x:auto;overflow-y:hidden;
  scrollbar-width:thin;height:30px;
}
.dsh-vue-tab{
  appearance:none;flex:0 0 auto;display:inline-flex;align-items:flex-end;gap:4px;
  height:30px;padding:0 6px;border:0;background:transparent;cursor:pointer;
  color:#6b645b;font:500 13px/16px "IBM Plex Sans","Noto Sans SC",sans-serif;
  position:relative;transition:color .14s ease;
}
.dsh-vue-tab-ink{position:relative;display:inline-block;padding:0 0 7px;}
.dsh-vue-tab-ink::after{
  content:"";position:absolute;left:0;right:0;bottom:0;height:2px;
  border-radius:1px;background:transparent;transition:background .14s ease;
}
.dsh-vue-tab:hover{color:#0f5c56;}
.dsh-vue-tab.is-on{color:#0f5c56;}
.dsh-vue-tab.is-on .dsh-vue-tab-ink::after{background:#0f5c56;}
.dsh-vue-tab:focus-visible{outline:2px solid #0f5c56;outline-offset:2px;border-radius:6px;}
.dsh-vue-x{
  appearance:none;width:16px;height:16px;margin:0 0 7px;padding:0;border:0;border-radius:999px;
  background:transparent;color:#6b645b;cursor:pointer;opacity:0;
  font:600 12px/1 "IBM Plex Sans",sans-serif;
  transition:opacity .14s ease,background .14s ease,color .14s ease,transform .14s ease;
}
.dsh-vue-tab:hover .dsh-vue-x,.dsh-vue-tab.is-on .dsh-vue-x,.dsh-vue-x:focus-visible{opacity:1;}
.dsh-vue-x:hover{background:#efe7d8;color:#8f2d2d;}
.dsh-vue-x:active{transform:scale(.92);}
.dsh-vue-x:focus-visible{outline:2px solid #0f5c56;outline-offset:1px;}
.dsh-vue-plus{
  appearance:none;flex:0 0 auto;width:22px;height:22px;margin:0 4px 6px;padding:0;
  border:1px solid #d8cfc0;border-radius:6px;background:#fffdf8;color:#0f5c56;
  display:inline-flex;align-items:center;justify-content:center;cursor:pointer;
  box-shadow:0 6px 14px rgba(27,25,22,.05);
  transition:background .14s ease,transform .14s ease,border-color .14s ease;
}
.dsh-vue-plus:hover{background:#d8ebe6;transform:translateY(-1px);}
.dsh-vue-plus:active{transform:scale(.96);}
.dsh-vue-plus:focus-visible{outline:2px solid #0f5c56;outline-offset:2px;}
.dsh-vue-plus.is-on{background:#0f5c56;color:#fffdf8;border-color:#0f5c56;}
.dsh-vue-plus svg{width:12px;height:12px;display:block;}
.dsh-vue-lib{
  position:fixed;z-index:80;min-width:248px;max-width:320px;max-height:min(72vh,420px);
  padding:12px;border:1px solid #d8cfc0;border-radius:14px;background:#fffdf8;
  box-shadow:0 18px 40px rgba(27,25,22,.12);
  color:#1b1916;font:13px/1.45 "IBM Plex Sans","Noto Sans SC",sans-serif;
  display:flex;flex-direction:column;gap:8px;
}
.dsh-vue-lib h2{margin:0;font:600 20px/1.2 "Cormorant Garamond","Noto Serif SC",serif;color:#0f5c56;}
.dsh-vue-lib p{margin:0;color:#6b645b;font-size:12px;}
.dsh-vue-lib-list{display:flex;flex-direction:column;gap:4px;overflow:auto;min-height:0;}
.dsh-vue-lib-item{
  appearance:none;width:100%;display:flex;align-items:center;justify-content:space-between;gap:10px;
  padding:8px 10px;border:1px solid transparent;border-radius:10px;background:#f4efe6;
  color:#1b1916;cursor:pointer;text-align:left;
  font:500 13px/1.3 "IBM Plex Sans","Noto Sans SC",sans-serif;
  transition:background .14s ease,border-color .14s ease,transform .14s ease;
}
.dsh-vue-lib-item:hover{background:#d8ebe6;border-color:#c5ddd7;}
.dsh-vue-lib-item:active{transform:scale(.99);}
.dsh-vue-lib-item:focus-visible{outline:2px solid #0f5c56;outline-offset:1px;}
.dsh-vue-lib-item span{color:#0f5c56;font-size:11px;letter-spacing:.04em;}
.dsh-vue-lib-reset{
  appearance:none;align-self:flex-end;padding:6px 12px;border:1px solid #d8cfc0;border-radius:999px;
  background:#fffdf8;color:#0f5c56;cursor:pointer;
  font:500 12px/1 "IBM Plex Sans","Noto Sans SC",sans-serif;
  transition:background .14s ease,transform .14s ease;
}
.dsh-vue-lib-reset:hover{background:#d8ebe6;}
.dsh-vue-lib-reset:active{transform:scale(.98);}
.dsh-vue-lib-reset:disabled{opacity:.45;cursor:default;transform:none;}
.dsh-vue-lib-reset:focus-visible{outline:2px solid #0f5c56;outline-offset:2px;}
.dsh-vue-head{
  appearance:none;display:inline-flex;align-items:center;gap:6px;
  padding:5px 12px;border:1px solid #d8cfc0;border-radius:999px;
  background:#fffdf8;color:#0f5c56;cursor:pointer;
  font:500 12px/1.2 "IBM Plex Sans","Noto Sans SC",sans-serif;
  transition:background .14s ease,transform .14s ease;
}
.dsh-vue-head:hover{background:#d8ebe6;transform:translateY(-1px);}
.dsh-vue-head:active{transform:scale(.98);}
.dsh-vue-head:focus-visible{outline:2px solid #0f5c56;outline-offset:2px;}
.dsh-vue-head.is-on{background:#0f5c56;color:#fffdf8;border-color:#0f5c56;}
.dsh-vue-toast{
  position:fixed;left:50%;bottom:28px;z-index:90;transform:translate(-50%,12px);
  padding:10px 16px;border:1px solid #d8cfc0;border-radius:999px;background:#fffdf8;
  color:#0f5c56;font:500 13px/1.3 "IBM Plex Sans","Noto Sans SC",sans-serif;
  box-shadow:0 12px 28px rgba(27,25,22,.1);opacity:0;pointer-events:none;
  transition:opacity .2s ease,transform .2s ease;
}
.dsh-vue-toast.in{opacity:1;transform:translate(-50%,0);}
`

function ensureCss() {
	let style = document.getElementById(STYLE_ID)
	if (!style) {
		style = document.createElement("style")
		style.id = STYLE_ID
		document.head.appendChild(style)
	}
	style.textContent = CSS
}

function tabName(tab) {
	return cleanName(tab.querySelector(".dsh-tab-label")?.textContent || tab.textContent)
}

function nativeLists() {
	return Array.from(document.querySelectorAll("header [role='tablist']"))
		.filter((list) => !list.closest(".dsh-vue-tabs") && !list.classList.contains("dsh-vue-tablist"))
		.filter((list) => nativeTabs(list).some((tab) => tabName(tab) === "对话"))
}

function nativeTabs(list) {
	return Array.from(list.querySelectorAll(":scope > [role='tab']"))
}

function applyHidden(hiddenNames) {
	const hide = new Set(hiddenNames.filter((name) => !PINNED.has(name)))
	for (const list of nativeLists()) {
		for (const tab of nativeTabs(list)) {
			const name = tabName(tab)
			tab.hidden = hide.has(name)
			tab.style.display = hide.has(name) ? "none" : ""
		}
	}
}

function hasNativeShelf() {
	return nativeLists().some((list) => nativeTabs(list).length > 0)
}

function readCatalog() {
	const list = nativeLists()[0]
	if (!list) return []
	return nativeTabs(list).map((tab) => ({
		name: tabName(tab),
		on: tab.getAttribute("aria-selected") === "true",
	})).filter((row) => row.name)
}

function clickNative(name) {
	for (const list of nativeLists()) {
		const tab = nativeTabs(list).find((item) => tabName(item) === name)
		if (tab) {
			tab.click()
			return true
		}
	}
	return false
}

function loadHidden() {
	try {
		const raw = JSON.parse(localStorage.getItem(STORE) || "[]")
		return Array.isArray(raw) ? raw.filter((name) => !PINNED.has(name)) : []
	} catch {
		return []
	}
}

function saveHidden(list) {
	localStorage.setItem(STORE, JSON.stringify(list))
}

function toast(text) {
	document.querySelector(".dsh-vue-toast")?.remove()
	const el = document.createElement("div")
	el.className = "dsh-vue-toast"
	el.setAttribute("role", "status")
	el.textContent = text
	document.body.appendChild(el)
	requestAnimationFrame(() => el.classList.add("in"))
	setTimeout(() => {
		el.classList.remove("in")
		setTimeout(() => el.remove(), 220)
	}, 2200)
}

function ensureHost() {
	let host = document.getElementById(HOST_ID)
	if (!host) {
		host = document.createElement("div")
		host.id = HOST_ID
		host.className = "dsh-vue-tabs"
		document.body.appendChild(host)
	}
	return host
}

/**
 * Where the floating tab shelf should sit. Null means hide it — a blank
 * workspace hides the conversation header (`display:none` / 0×0), and the
 * old fallback parked the shelf at (0,0) on top of the sidebar rail.
 * @param box - header rect plus optional display / ariaHidden flags.
 */
export function computeTabShelfBox(box) {
	if (!box) return null
	if (box.ariaHidden === true || box.hidden === true || box.display === "none") return null
	const width = Number(box.width) || 0
	const height = Number(box.height) || 0
	const left = Number(box.left) || 0
	const bottom = Number(box.bottom) || 0
	if (width < 160 || height < 8) return null
	if (left < 40 && width < 220) return null
	return {
		left: Math.round(Math.max(0, left)),
		top: Math.round(Math.max(0, bottom - 30)),
		width: Math.round(width),
	}
}

function headerBox(header) {
	const rect = header.getBoundingClientRect()
	return computeTabShelfBox({
		left: rect.left,
		bottom: rect.bottom,
		width: rect.width,
		height: rect.height,
		display: getComputedStyle(header).display,
		ariaHidden: header.getAttribute("aria-hidden") === "true",
		hidden: header.hidden,
	})
}

function placeHost() {
	const host = document.getElementById(HOST_ID)
	if (!host) return
	const list = nativeLists()[0]
	const header = list?.closest("header") ?? null
	const box = header ? headerBox(header) : null
	document.documentElement.classList.remove("dsh-vue-tabs-native")
	document.documentElement.classList.toggle("dsh-vue-tabs-idle", !box)
	if (!box) {
		host.hidden = true
		host.setAttribute("aria-hidden", "true")
		return
	}
	host.hidden = false
	host.removeAttribute("aria-hidden")
	host.style.left = `${box.left}px`
	host.style.width = `${box.width}px`
	host.style.top = `${box.top}px`
	host.style.height = "30px"
}

export async function mountTabShelf() {
	if (window.__dshVueTabs) return window.__dshVueTabs
	ensureCss()
	document.documentElement.classList.add("dsh-vue-tabs-on")

	const { createApp, ref, computed, onMounted, onUnmounted, nextTick } = await import("/plugins/dsh-dashboard/vue.esm-browser.js")

	const app = createApp({
		template: `
			<div class="dsh-vue-tablist" role="tablist">
				<button
					v-for="name in openTabs"
					:key="name"
					type="button"
					role="tab"
					class="dsh-vue-tab"
					:class="{ 'is-on': active === name }"
					:aria-selected="active === name ? 'true' : 'false'"
					@click="select(name)"
					@auxclick.middle.prevent="close(name)"
				>
					<span class="dsh-vue-tab-ink">{{ name }}</span>
					<button
						v-if="!pinned[name]"
						type="button"
						class="dsh-vue-x"
						:aria-label="'关闭 ' + name"
						title="关闭"
						@click.stop="close(name)"
					>×</button>
				</button>
				<button
					ref="plusRef"
					type="button"
					class="dsh-vue-plus"
					:class="{ 'is-on': libOpen }"
					aria-haspopup="menu"
					:aria-expanded="libOpen ? 'true' : 'false'"
					title="从页签库打开"
					aria-label="从页签库打开"
					@click.stop="toggleLib"
					@mousedown.stop
				>
					<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1.5v9M1.5 6h9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
				</button>
			</div>
			<Teleport to="body">
				<div
					v-if="libOpen"
					class="dsh-vue-lib"
					role="menu"
					:style="libStyle"
					@mousedown.stop
				>
					<h2>页签库</h2>
					<p>{{ closedTabs.length ? "关掉的页签在这里，点一下即可钉回栏上。" : "栏上的页签都在。关掉一个，就会出现在这本册子里。" }}</p>
					<div class="dsh-vue-lib-list">
						<button
							v-for="name in closedTabs"
							:key="name"
							type="button"
							class="dsh-vue-lib-item"
							role="menuitem"
							@click="open(name)"
						>
							<b>{{ name }}</b><span>打开</span>
						</button>
					</div>
					<button type="button" class="dsh-vue-lib-reset" :disabled="!closedTabs.length" @click="restore">全部打开</button>
				</div>
			</Teleport>
		`,
		setup() {
			const seed = loadCatalog()
			const names = ref(seed.map((row) => row.name))
			const hidden = ref(loadHidden())
			const active = ref(seed.find((row) => row.on)?.name || "对话")
			const libOpen = ref(false)
			const libStyle = ref({})
			const plusRef = ref(null)
			const pinned = { 对话: true }

			const openTabs = computed(() => names.value.filter((name) => !hidden.value.includes(name)))
			const closedTabs = computed(() => names.value.filter((name) => hidden.value.includes(name)))

			function persist() {
				saveHidden(hidden.value)
				applyHidden(hidden.value)
			}

			function announce() {
				window.dispatchEvent(new CustomEvent("dsh-tab-change", { detail: { name: active.value } }))
			}

			function isComposerNoise(mutation) {
				const node = mutation.target
				const el = node && node.nodeType === 1 ? node : node && node.parentElement
				return Boolean(el && el.closest && el.closest("[data-composer-card], [data-trigger-menu], [data-composer-seat], #dsh-vue-tabs-root, #dsh-work-frame"))
			}

			function sync() {
				const catalog = mergeCatalog(
					names.value.map((name) => ({ name, on: name === active.value })),
					readCatalog(),
				)
				saveCatalog(catalog)
				names.value = catalog.map((row) => row.name)
				const current = catalog.find((row) => row.on)
				const nextActive = current ? current.name : active.value
				const activeChanged = nextActive !== active.value
				if (current) active.value = current.name
				applyHidden(hidden.value)
				placeHost()
				if (activeChanged) announce()
			}

			function select(name) {
				active.value = name
				clickNative(name)
				announce()
			}

			function close(name) {
				if (PINNED.has(name)) return
				if (!hidden.value.includes(name)) hidden.value = [...hidden.value, name]
				persist()
				if (active.value === name) select("对话")
				libOpen.value = false
				toast("已收起「" + name + "」，可从 + 打开")
			}

			function open(name) {
				hidden.value = hidden.value.filter((item) => item !== name)
				persist()
				libOpen.value = false
				nextTick(() => select(name))
				toast("已打开「" + name + "」")
			}

			function restore() {
				hidden.value = []
				persist()
				libOpen.value = false
				toast("页签已全部回到栏上")
			}

			function placeLib() {
				const box = plusRef.value?.getBoundingClientRect()
				if (!box) return
				libStyle.value = {
					left: Math.min(Math.max(8, box.left), window.innerWidth - 260) + "px",
					top: box.bottom + 8 + "px",
				}
			}

			let ignoreDocUntil = 0
			function toggleLib(event) {
				event?.stopPropagation?.()
				libOpen.value = !libOpen.value
				if (libOpen.value) {
					ignoreDocUntil = Date.now() + 500
					nextTick(() => {
						const el = event?.currentTarget || plusRef.value
						const box = el?.getBoundingClientRect()
						if (!box) return placeLib()
						libStyle.value = {
							left: Math.min(Math.max(8, box.left), window.innerWidth - 260) + "px",
							top: box.bottom + 8 + "px",
						}
					})
				}
			}

			function onDoc(event) {
				if (!libOpen.value) return
				if (Date.now() < ignoreDocUntil) return
				if (event.target.closest(".dsh-vue-lib, .dsh-vue-plus, .dsh-vue-head")) return
				libOpen.value = false
			}

			function onKey(event) {
				if (event.key === "Escape") libOpen.value = false
			}

			let timer
			let observer
			onMounted(() => {
				sync()
				observer = new MutationObserver((mutations) => {
					if (mutations.every(isComposerNoise)) return
					clearTimeout(timer)
					timer = setTimeout(sync, 40)
				})
				observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-selected"] })
				document.addEventListener("mousedown", onDoc, true)
				document.addEventListener("keydown", onKey, true)
			})
			onUnmounted(() => {
				observer?.disconnect()
				document.removeEventListener("mousedown", onDoc, true)
				document.removeEventListener("keydown", onKey, true)
			})

			window.__dshTabShelf = {
				open, close, restore, toggleLib, sync, select,
				active: () => active.value,
			}

			return {
				names, hidden, active, libOpen, libStyle, plusRef, pinned,
				openTabs, closedTabs, select, close, open, restore, toggleLib,
			}
		},
	})

	let mountedHost = null
	function mountInto() {
		const host = ensureHost()
		if (mountedHost === host) {
			placeHost()
			return true
		}
		if (mountedHost) {
			try { app.unmount() } catch { /* 旧宿主已不在 */ }
			mountedHost = null
		}
		app.mount(host)
		mountedHost = host
		placeHost()
		return true
	}

	mountInto()
	window.addEventListener("resize", placeHost)
	window.addEventListener("scroll", placeHost, true)
	const watch = new MutationObserver(() => {
		if (!document.getElementById(HOST_ID)) {
			mountedHost = null
			mountInto()
		}
	})
	watch.observe(document.documentElement, { childList: true, subtree: true })

	const api = { app, remount: mountInto }
	window.__dshVueTabs = api
	return api
}
