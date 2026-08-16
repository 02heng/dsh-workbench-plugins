window.__ModuleLoader__.load({
	id: "dsh-office",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		var react = require("react");

		function DocsInboxPanel() {
			return react.createElement("div", { className: "dsh-work-slot", "aria-hidden": "true" });
		}

		var inject = ["slots"];
		function apply(ctx) {
			ctx.slots.inject("conversation.view", function () {
				return ctx.slots.register({
					name: "conversation.view",
					id: "docs-inbox",
					order: 33,
					label: function () { return "知识库"; },
					inject: function () { return {}; },
				}, DocsInboxPanel);
			});
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	},
});
