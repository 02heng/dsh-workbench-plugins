window.__ModuleLoader__.load({
	id: "dsh-messenger",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		var react = require("react");

		function MessengerDeskPanel() {
			return react.createElement("div", { className: "dsh-work-slot", "aria-hidden": "true" });
		}

		var inject = ["slots"];
		function apply(ctx) {
			ctx.slots.inject("conversation.view", function () {
				return ctx.slots.register({
					name: "conversation.view",
					id: "messenger",
					order: 34,
					label: function () { return "信使"; },
					inject: function () { return {}; },
				}, MessengerDeskPanel);
			});
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	},
});
