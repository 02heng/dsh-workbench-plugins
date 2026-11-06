window.__ModuleLoader__.load({
	id: "dsh-photocraft",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		var react = require("react");

		var WORKBENCH = "/plugins/dsh-photocraft/";

		function openWorkbench() {
			try {
				window.open(WORKBENCH, "_blank", "noopener,noreferrer");
			} catch (error) {
				/* 弹窗被拦截时忽略：面板内 iframe 仍可用 */
			}
		}

		function PhotoCraftPanel() {
			return react.createElement(
				"div",
				{
					className: "dsh-wall-frame",
					style: {
						height: "100%",
						minHeight: "72vh",
						flex: "1 1 auto",
						display: "flex",
						flexDirection: "column",
						background: "#0b0d0f",
						borderRadius: "14px",
						overflow: "hidden",
					},
				},
				react.createElement(
					"div",
					{
						style: {
							display: "flex",
							alignItems: "center",
							gap: "12px",
							padding: "10px 14px",
							borderBottom: "1px solid #232c33",
							background: "linear-gradient(180deg,#11161a,#0d1114)",
							color: "#e9eff5",
							font: "13px/1.4 'Noto Sans SC',system-ui,sans-serif",
						},
					},
					react.createElement("span", { style: { color: "#6ee7d2", fontWeight: 600, letterSpacing: ".04em" } }, "PHOTOCRAFT"),
					react.createElement("span", { style: { color: "#82919d" } }, "批量去水印 · 一键抠图 · 画笔还原"),
					react.createElement("span", { style: { flex: "1 1 auto" } }),
					react.createElement(
						"button",
						{
							type: "button",
							onClick: openWorkbench,
							style: {
								cursor: "pointer",
								border: "1px solid #2e3a43",
								background: "#151b20",
								color: "#c3ced8",
								borderRadius: "999px",
								padding: "5px 12px",
								font: "12px/1.4 'Noto Sans SC',system-ui,sans-serif",
							},
						},
						"在新窗口打开",
					),
				),
				react.createElement("iframe", {
					src: WORKBENCH,
					title: "PhotoCraft 工作台",
					loading: "lazy",
					style: {
						flex: "1 1 auto",
						width: "100%",
						height: "100%",
						minHeight: "68vh",
						border: "0",
						background: "#0b0d0f",
						display: "block",
					},
				}),
			);
		}

		var inject = ["slots"];
		function apply(ctx) {
			ctx.slots.inject("conversation.view", function () {
				return ctx.slots.register({
					name: "conversation.view",
					id: "photocraft",
					order: 35,
					label: function () { return "修图台"; },
					inject: function () { return {}; },
				}, PhotoCraftPanel);
			});
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	},
});
