window.__ModuleLoader__.load({
	id: "dsh-messenger",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		var react = require("react");

		function MessengerDeskPanel() {
			return react.createElement("div", {
				className: "dsh-wall-frame",
				style: { height: "100%", minHeight: "72vh", flex: "1 1 auto", display: "flex", flexDirection: "column" },
			}, react.createElement("iframe", {
				src: "/plugins/dsh-messenger/desk",
				title: "信使",
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
