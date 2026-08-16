window.__ModuleLoader__.load({
	id: "dsh-datacenter",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		var react = require("react");

		function DutyBoardPanel() {
			return react.createElement("div", { className: "dsh-work-slot", "aria-hidden": "true" });
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
