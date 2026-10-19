window.__ModuleLoader__.load({
	id: "dsh-craft",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		var react = require("react");

		var MODES = [
			{ id: "ask", label: "问一问", hint: "只答，不改文件、不发微信" },
			{ id: "plan", label: "想一想", hint: "先出做法，点选后才写" },
			{ id: "craft", label: "做一做", hint: "可以写文件、发微信" },
		];
		function shouldShowCraftDock(tabName) {
			var label = String(tabName || "").replace(/[×✕]/g, "").replace(/\(\d+\)/g, "").replace(/\s+/g, " ").trim();
			if (!label || label === "对话" || label.indexOf("对话") === 0) return true;
			var hide = ["记忆", "技能", "待办", "轨迹", "书籍转技能", "派活台", "数据大屏", "信使", "上下文"];
			for (var i = 0; i < hide.length; i++) {
				if (label === hide[i] || label.indexOf(hide[i]) === 0) return false;
			}
			return true;
		}
		void shouldShowCraftDock;
		void MODES;

		function mountCraftDock() {
			if (document.getElementById("dsh-craft-chips-src")) return;
			var script = document.createElement("script");
			script.id = "dsh-craft-chips-src";
			script.src = "/plugins/dsh-dashboard/craft-chips.js?v=20261008b";
			document.head.appendChild(script);
			window.addEventListener("dsh-tab-change", function () {
				if (window.__dshPlaceCraftDock) window.__dshPlaceCraftDock();
			});
		}

		function CraftDock() {
			return null;
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
			mountCraftDock();
			ctx.slots.inject("conversation.input.left", function () {
				return ctx.slots.register({
					name: "conversation.input.left",
					id: "craft-mode",
					order: 20,
					label: function () { return "问想做"; },
					inject: function () { return {}; },
				}, CraftDock);
			});
			ctx.slots.inject("conversation.input.right", function () {
				return ctx.slots.register({
					name: "conversation.input.right",
					id: "craft-mode-right",
					order: 8,
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
