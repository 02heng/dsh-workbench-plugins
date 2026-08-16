window.__ModuleLoader__.load({
	id: "dsh-office",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		var react = require("react");

		function DocsInboxPanel() {
			return react.createElement("div", {
				className: "dsh-wall-frame",
				style: { height: "100%", minHeight: "72vh", flex: "1 1 auto", display: "flex", flexDirection: "column" },
			}, react.createElement("iframe", {
				src: "/plugins/dsh-docs/inbox",
				title: "知识库",
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
