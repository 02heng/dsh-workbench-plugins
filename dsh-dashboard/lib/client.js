window.__ModuleLoader__.load({
	id: "dsh-dashboard",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		var react = require("react");

		var STYLE_ID = "dsh-workbench-chrome-css";
		var showGen = 0;
		var ATELIER = {
			"书籍转技能": "book",
			"轨迹": "trail",
			"记忆": "memory",
			"技能": "skills",
			"待办": "todos",
			"派活台": "craft",
		};
		var CSS = [
			"@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600&family=IBM+Plex+Sans:wght@400;500;600&family=Noto+Sans+SC:wght@400;500;600&display=swap');",
			"html.dsh-paper,html.dsh-paper body{background:#f4efe6!important;color:#1b1916!important;}",
			"html.dsh-paper body,html.dsh-paper button,html.dsh-paper input,html.dsh-paper textarea{",
			"font-family:'IBM Plex Sans','Noto Sans SC',sans-serif!important;",
			"}",
			"html.dsh-paper aside,html.dsh-paper [class*='sidebar'],html.dsh-paper [class*='Workspace']{",
			"background:#f7f3eb!important;border-color:#d8cfc0!important;color:#1b1916!important;",
			"}",
			"html.dsh-paper header{background:#fffdf8!important;border-color:#d8cfc0!important;color:#1b1916!important;}",
			"html.dsh-paper header h1,html.dsh-paper header [class*='title']{",
			"font-family:'Cormorant Garamond','Noto Serif SC',serif!important;color:#0f5c56!important;",
			"}",
			"html[data-composer-drawer='in'] [data-composer-seat]{",
			"max-height:0!important;min-height:0!important;overflow:hidden!important;",
			"opacity:0;pointer-events:none;margin:0!important;padding:0!important;",
			"transform:translateY(12px);transition:max-height .28s ease,opacity .2s ease,transform .2s ease;",
			"}",
			"[data-composer-seat]{transition:opacity .2s ease,transform .2s ease;}",
			".dsh-drawer-handle{",
			"position:sticky;bottom:10px;z-index:40;margin:0 auto 8px;display:flex;",
			"align-items:center;justify-content:center;gap:8px;",
			"min-width:168px;padding:8px 18px;border-radius:999px;cursor:pointer;",
			"border:1px solid #d8cfc0;background:#fffdf8;color:#0f5c56;",
			"font:500 13px/1.2 'IBM Plex Sans','Noto Sans SC',sans-serif;",
			"box-shadow:0 10px 24px rgba(27,25,22,.08);",
			"transition:transform .16s ease,background .16s ease,box-shadow .16s ease;",
			"}",
			".dsh-drawer-handle:hover{background:#d8ebe6;transform:translateY(-1px);}",
			".dsh-drawer-handle:active{transform:scale(.98);}",
			".dsh-drawer-handle:focus-visible{outline:2px solid #0f5c56;outline-offset:2px;}",
			".dsh-drawer-handle svg{width:14px;height:14px;display:block;}",
			".dsh-wall-frame{height:100%;min-height:72vh;flex:1 1 auto;display:flex;flex-direction:column;}",
			".dsh-wall-frame iframe{flex:1 1 auto;width:100%;height:100%;min-height:72vh;border:0;background:#f4efe6;display:block;}",
			".dsh-vue-head{",
			"appearance:none;display:inline-flex;align-items:center;gap:6px;",
			"padding:5px 12px;border:1px solid #d8cfc0;border-radius:999px;",
			"background:#fffdf8;color:#0f5c56;cursor:pointer;",
			"font:500 12px/1.2 'IBM Plex Sans','Noto Sans SC',sans-serif;",
			"transition:background .14s ease,transform .14s ease;",
			"}",
			".dsh-vue-head:hover{background:#d8ebe6;transform:translateY(-1px);}",
			".dsh-vue-head:active{transform:scale(.98);}",
			".dsh-vue-head:focus-visible{outline:2px solid #0f5c56;outline-offset:2px;}",
			"#dsh-atelier-frame{",
			"position:fixed;z-index:28;border:0;background:#f4efe6;display:none;",
			"width:0;height:0;right:auto;bottom:auto;",
			"}",
			"html[data-atelier] #dsh-atelier-frame{display:block;}",
			"html[data-atelier] [class*='viewArea']>*,html[data-atelier] [class*='ViewArea']>*{",
			"visibility:hidden!important;",
			"}",
			"html:not([data-atelier]) [class*='viewArea']>*,html:not([data-atelier]) [class*='ViewArea']>*{",
			"visibility:visible;",
			"}",
			"html.dsh-paper [class*='viewArea']{flex:1;min-height:0;}",
			"html.dsh-paper [class*='viewArea']>.dsh-wall-frame,html.dsh-paper [class*='viewArea']>div{",
			"flex:1 1 auto;min-height:72vh;height:100%;",
			"}",
		].join("");

		function ensureCss() {
			document.documentElement.classList.add("dsh-paper");
			if (document.getElementById(STYLE_ID)) return;
			var style = document.createElement("style");
			style.id = STYLE_ID;
			style.textContent = CSS;
			document.head.appendChild(style);
		}

		function isIn() {
			return document.documentElement.getAttribute("data-composer-drawer") === "in";
		}

		function setDrawer(next) {
			if (next) document.documentElement.setAttribute("data-composer-drawer", "in");
			else document.documentElement.removeAttribute("data-composer-drawer");
			window.dispatchEvent(new Event("dsh-composer-drawer"));
		}

		function cleanName(text) {
			return String(text || "").replace(/[×✕]/g, "").replace(/\(\d+\)/g, "").replace(/\s+/g, " ").trim();
		}

		function atelierKey(name) {
			var label = cleanName(name);
			if (ATELIER[label]) return ATELIER[label];
			var keys = Object.keys(ATELIER);
			for (var i = 0; i < keys.length; i++) {
				if (label.indexOf(keys[i]) === 0) return ATELIER[keys[i]];
			}
			return "";
		}

		function bootVueTabs() {
			if (document.querySelector("script[data-dsh-vue-tabs]")) return;
			var script = document.createElement("script");
			script.type = "module";
			script.dataset.dshVueTabs = "1";
			script.textContent = 'import { mountTabShelf } from "/plugins/dsh-dashboard/vue-tabs.js"; mountTabShelf();';
			document.head.appendChild(script);
		}

		function computeAtelierBox(input) {
			var view = input.view;
			var header = input.header;
			var aside = input.aside;
			var composer = input.composer;
			var viewport = input.viewport || {};
			var vw = viewport.width || 0;
			var vh = viewport.height || 0;
			var rail = Math.round(aside && aside.right != null ? aside.right : 0);
			var safeRail = rail >= 40 ? rail : 0;
			var headerBottom = Math.round(header && header.bottom != null ? header.bottom : 88);
			var composerTop = composer && composer.top > 80 ? Math.round(composer.top) : vh;
			var top, left, right;
			if (view && view.width >= 320 && view.height >= 80) {
				top = Math.round(view.top);
				left = Math.round(view.left);
				right = Math.round(view.right != null ? view.right : view.left + view.width);
			} else {
				top = headerBottom;
				left = safeRail;
				right = vw;
			}
			if (safeRail > left) left = safeRail;
			if (left < 40 && safeRail >= 40) left = safeRail;
			if (left < 40 && vw >= 800) left = 56;
			var bottom = Math.min(composerTop, vh);
			return {
				top: top,
				left: left,
				width: Math.max(0, Math.round(right - left)),
				height: Math.max(0, Math.round(bottom - top)),
			};
		}

		function frameEl() {
			var frame = document.getElementById("dsh-atelier-frame");
			if (frame) return frame;
			frame = document.createElement("iframe");
			frame.id = "dsh-atelier-frame";
			frame.title = "工作台账";
			frame.setAttribute("width", "1");
			frame.setAttribute("height", "1");
			document.body.appendChild(frame);
			return frame;
		}

		function placeFrame() {
			var frame = document.getElementById("dsh-atelier-frame");
			if (!frame || !document.documentElement.getAttribute("data-atelier")) return;
			var view = document.querySelector("[class*='viewArea']");
			var header = document.querySelector("header:has([role='tablist'])") || document.querySelector("header");
			var rail = document.querySelector("[class*='sidebarCol'], [class*='SidebarCol'], [class*='workspaceList'], [class*='WorkspaceList'], aside");
			var composer = document.querySelector("[data-composer-seat]");
			var box = computeAtelierBox({
				view: view ? view.getBoundingClientRect() : null,
				header: header ? header.getBoundingClientRect() : null,
				aside: rail ? rail.getBoundingClientRect() : null,
				composer: composer ? composer.getBoundingClientRect() : null,
				viewport: { width: window.innerWidth, height: window.innerHeight },
			});
			frame.style.top = box.top + "px";
			frame.style.left = box.left + "px";
			frame.style.width = box.width + "px";
			frame.style.height = box.height + "px";
			frame.setAttribute("width", String(box.width));
			frame.setAttribute("height", String(box.height));
		}

		async function resolveSessionId() {
			if (window.__dshSessionId) return window.__dshSessionId;
			try {
				var res = await fetch("/api/session.list", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ type: "req", rpcId: crypto.randomUUID(), method: "session.list", payload: {} }),
				});
				var data = await res.json();
				var bag = data.value || data.payload || data;
				var items = bag.items || bag.sessions || [];
				var title = (document.querySelector("header h1") || document.querySelector("header [class*='title']") || {}).textContent || "";
				title = String(title).trim();
				var hit = items.find(function (item) { return (item.displayTitle || item.title) === title; })
					|| items.find(function (item) { return item.running; })
					|| items[0];
				if (hit) window.__dshSessionId = hit.sessionId || hit.id;
			} catch (_error) { /* 会话列表不是必须 */ }
			return window.__dshSessionId || "";
		}

		async function showAtelier(page) {
			ensureCss();
			var ticket = ++showGen;
			var frame = frameEl();
			var sid = await resolveSessionId();
			if (ticket !== showGen) return;
			var next = "/plugins/dsh-dashboard/atelier?page=" + encodeURIComponent(page)
				+ (sid ? "&session=" + encodeURIComponent(sid) : "")
				+ "#/" + page;
			if (frame.dataset.page !== page || frame.dataset.session !== sid) {
				frame.src = next;
				frame.dataset.page = page;
				frame.dataset.session = sid || "";
			}
			document.documentElement.setAttribute("data-atelier", page);
			setDrawer(false);
			placeFrame();
		}

		function hideAtelier() {
			showGen += 1;
			document.documentElement.removeAttribute("data-atelier");
			setDrawer(false);
			var frame = document.getElementById("dsh-atelier-frame");
			if (!frame) return;
			frame.src = "about:blank";
			frame.dataset.page = "";
			frame.dataset.session = "";
			frame.style.width = "0";
			frame.style.height = "0";
			frame.style.top = "0";
			frame.style.left = "0";
		}

		function onTab(name) {
			var page = atelierKey(name);
			if (page) showAtelier(page);
			else hideAtelier();
		}

		function bootAtelier() {
			if (window.__dshAtelier) return;
			window.__dshAtelier = true;
			ensureCss();
			window.addEventListener("dsh-tab-change", function (event) {
				onTab(event.detail && event.detail.name);
			});
			window.addEventListener("resize", placeFrame);
			var timer;
			var watch = new MutationObserver(function () {
				clearTimeout(timer);
				timer = setTimeout(placeFrame, 40);
			});
			watch.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
		}

		function Handle() {
			ensureCss();
			var open = react.useState(isIn());
			var folded = open[0];
			var setFolded = open[1];
			react.useEffect(function () {
				var sync = function () { setFolded(isIn()); };
				window.addEventListener("dsh-composer-drawer", sync);
				return function () { window.removeEventListener("dsh-composer-drawer", sync); };
			}, []);
			return react.createElement("button", {
				type: "button",
				className: "dsh-drawer-handle",
				"aria-pressed": folded ? "true" : "false",
				title: folded ? "展开对话" : "收起对话",
				onClick: function () { setDrawer(!isIn()); },
			},
			react.createElement("svg", { viewBox: "0 0 16 16", "aria-hidden": "true" },
				react.createElement("path", {
					d: folded ? "M3 10l5-5 5 5" : "M3 6l5 5 5-5",
					fill: "none",
					stroke: "currentColor",
					strokeWidth: "1.6",
					strokeLinecap: "round",
					strokeLinejoin: "round",
				})
			),
			folded ? "展开对话" : "收起对话");
		}

		function TabLibrary() {
			ensureCss();
			react.useEffect(function () { bootVueTabs(); }, []);
			return react.createElement("button", {
				type: "button",
				className: "dsh-vue-head",
				"aria-haspopup": "menu",
				title: "从页签库打开或恢复页签",
				onClick: function (event) {
					if (window.__dshTabShelf) window.__dshTabShelf.toggleLib(event);
					else bootVueTabs();
				},
			}, "+ 页签库");
		}

		function DataWallPanel() {
			react.useEffect(function () {
				ensureCss();
				setDrawer(true);
			}, []);
			return react.createElement("div", { className: "dsh-wall-frame" },
				react.createElement("iframe", {
					src: "/plugins/dsh-dashboard/wall",
					title: "数据大屏",
					loading: "lazy",
				})
			);
		}

		var inject = ["slots"];
		function apply(ctx) {
			bootVueTabs();
			bootAtelier();
			ctx.slots.inject("conversation.view", function () {
				return ctx.slots.register({
					name: "conversation.view",
					id: "data-wall",
					order: 31,
					label: function () { return "数据大屏"; },
					inject: function () { return {}; },
				}, DataWallPanel);
			});
			ctx.slots.inject("conversation.session.header.actions", function () {
				return ctx.slots.register({
					name: "conversation.session.header.actions",
					id: "tab-shelf",
					order: 16,
					label: function () { return "页签库"; },
					inject: function () { return {}; },
				}, TabLibrary);
			});
			ctx.slots.inject("conversation.session.header.actions", function () {
				return ctx.slots.register({
					name: "conversation.session.header.actions",
					id: "composer-drawer",
					order: 18,
					label: function () { return "对话抽屉"; },
					inject: function () { return {}; },
				}, Handle);
			});
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	},
});
