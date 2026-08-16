window.__ModuleLoader__.load({
	id: "dsh-craft",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		var react = require("react");

		var MODES = [
			{ id: "ask", label: "问" },
			{ id: "plan", label: "想" },
			{ id: "craft", label: "做" },
		];
		var EXPERTS = [
			{ id: "official", label: "公文" },
			{ id: "thesis", label: "课题" },
			{ id: "duty", label: "值班" },
		];

		var css = [
			".dsh-craft-dock{display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:0 2px 6px;}",
			".dsh-craft-chip{",
			"appearance:none;border:1px solid #d8cfc0;background:#fffdf8;color:#0f5c56;",
			"border-radius:999px;padding:5px 12px;cursor:pointer;",
			"font:500 12px/1.2 'IBM Plex Sans','Noto Sans SC',sans-serif;",
			"transition:transform .14s ease,background .14s ease;",
			"}",
			".dsh-craft-chip:hover{background:#d8ebe6;transform:translateY(-1px);}",
			".dsh-craft-chip:active{transform:scale(.98);}",
			".dsh-craft-chip:focus-visible{outline:2px solid #0f5c56;outline-offset:2px;}",
			".dsh-craft-chip.is-on{background:#0f5c56;color:#f7fffc;border-color:#0f5c56;}",
			".dsh-craft-sep{width:1px;height:16px;background:#d8cfc0;margin:0 4px;}",
		].join("");

		function ensureCss() {
			if (document.getElementById("dsh-craft-dock-css")) return;
			var style = document.createElement("style");
			style.id = "dsh-craft-dock-css";
			style.textContent = css;
			document.head.appendChild(style);
		}

		function CraftDock() {
			var state = react.useState({ mode: "craft", expert: "none" });
			var snap = state[0];
			var setSnap = state[1];
			react.useEffect(function () {
				ensureCss();
				fetch("/plugins/dsh-craft/api/state").then(function (res) { return res.json(); }).then(function (data) {
					if (data && data.mode) setSnap({ mode: data.mode, expert: data.expert || "none" });
				}).catch(function () {});
			}, []);
			function post(path, body) {
				return fetch(path, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(body),
				}).then(function (res) { return res.json(); }).then(function (data) {
					if (data.error) throw new Error(data.error);
					setSnap({ mode: data.mode || snap.mode, expert: data.expert || snap.expert });
				});
			}
			return react.createElement("div", { className: "dsh-craft-dock", "aria-label": "问想做" },
				MODES.map(function (item) {
					return react.createElement("button", {
						key: item.id,
						type: "button",
						className: "dsh-craft-chip" + (snap.mode === item.id ? " is-on" : ""),
						onClick: function () { post("/plugins/dsh-craft/api/mode", { mode: item.id }); },
					}, item.label);
				}),
				react.createElement("span", { className: "dsh-craft-sep", "aria-hidden": "true" }),
				EXPERTS.map(function (item) {
					return react.createElement("button", {
						key: item.id,
						type: "button",
						className: "dsh-craft-chip" + (snap.expert === item.id ? " is-on" : ""),
						onClick: function () {
							post("/plugins/dsh-craft/api/expert", { expert: snap.expert === item.id ? "none" : item.id });
						},
					}, item.label);
				})
			);
		}

		function CraftDeskPanel() {
			return react.createElement("div", {
				className: "dsh-wall-frame",
				style: { height: "100%", minHeight: "72vh", flex: "1 1 auto", display: "flex", flexDirection: "column" },
			}, react.createElement("iframe", {
				src: "/plugins/dsh-craft/desk",
				title: "派活台",
				loading: "lazy",
				style: {
					flex: "1 1 auto",
					width: "100%",
					height: "100%",
					minHeight: "72vh",
					border: "0",
					background: "#f4efe6",
					display: "block",
				},
			}));
		}

		var inject = ["slots"];
		function apply(ctx) {
			ctx.slots.inject("conversation.input.dock", function () {
				return ctx.slots.register({
					name: "conversation.input.dock",
					id: "craft-mode",
					order: 12,
					label: function () { return "问想做"; },
					inject: function () { return {}; },
				}, CraftDock);
			});
			ctx.slots.inject("conversation.view", function () {
				return ctx.slots.register({
					name: "conversation.view",
					id: "craft-desk",
					order: 33,
					label: function () { return "派活台"; },
					inject: function () { return {}; },
				}, CraftDeskPanel);
			});
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	},
});
