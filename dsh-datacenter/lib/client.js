window.__ModuleLoader__.load({
	id: "dsh-datacenter",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		var react = require("react");

		function DutyBoardPanel() {
			return react.createElement("div", {
				className: "dsh-wall-frame",
				style: { height: "100%", minHeight: "72vh", flex: "1 1 auto", display: "flex", flexDirection: "column" },
			}, react.createElement("iframe", {
				src: "/plugins/dsh-datacenter/board",
				title: "循环任务",
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
			ctx.slots.inject("conversation.view", function () {
				return ctx.slots.register({
					name: "conversation.view",
					id: "duty-loops",
					order: 32,
					label: function () { return "循环任务"; },
					inject: function () { return {}; },
				}, DutyBoardPanel);
			});
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	},
});
