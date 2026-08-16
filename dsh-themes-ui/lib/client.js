window.__ModuleLoader__.load({
	id: "@dshthemes/ui",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let _deepseek_ai_dsh_client_runtime_client = require("@deepseek-ai/dsh-client-runtime/client");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region ../core/src/themes/catppuccin.ts
		/**
		* Soft pastel theme inspired by Catppuccin Mocha: muted mauve accents over
		* warm dark surfaces.
		*/
		const catppuccin = Object.freeze({
			id: "catppuccin",
			colorScheme: "dark",
			tokens: Object.freeze({
				"--dsw-alias-bg-base": "#1e1e2e",
				"--dsw-alias-bg-layer-1": "#242436",
				"--dsw-alias-bg-layer-2": "#2b2b40",
				"--dsw-alias-bg-layer-3": "#313244",
				"--dsw-alias-bg-overlay": "#45475a",
				"--dsw-alias-label-primary": "#cdd6f4",
				"--dsw-alias-label-secondary": "#a6adc8",
				"--dsw-alias-label-tertiary": "#9399b2",
				"--dsw-alias-brand-primary": "#cba6f7",
				"--dsw-alias-state-business-primary": "#89b4fa",
				"--dsw-alias-state-success-primary": "#a6e3a1",
				"--dsw-alias-state-warn-primary": "#f9e2af",
				"--dsw-alias-state-error-primary": "#f38ba8",
				"--dsw-alias-border-l1": "rgba(205, 214, 244, 0.08)",
				"--dsw-alias-border-l2": "rgba(205, 214, 244, 0.15)",
				"--dsw-alias-interactive-bg-hover": "rgba(205, 214, 244, 0.06)",
				"--dsw-alias-interactive-bg-active": "rgba(205, 214, 244, 0.12)",
				"--dsw-alias-button-primary-fill": "#cba6f7",
				"--dsw-alias-button-primary-hover": "#d4b4f8",
				"--dsw-alias-markdown-code-block": "#181825",
				"--dsw-alias-markdown-code-block-banner": "#181825",
				"--dsw-alias-markdown-inline-code": "#313244",
				"--dsw-alias-markdown-tag": "#313244",
				"--dsw-alias-scrollbar-bg-l1": "#45475a",
				"--dsw-alias-scrollbar-hover-l1": "#6c7086",
				"--dsw-alias-tooltip-bg": "#45475a",
				"--dsw-specific-bubble": "#313244",
				"--dsw-specific-bubble-highlight": "#45475a",
				"--dsw-specific-sidebar-fill": "#181825",
				"--dsw-specific-sidebar-nav-item-active": "#313244",
				"--dsw-alias-bg-mask-1": "rgba(0, 0, 0, 0.5)",
				"--dsw-alias-bg-mask-2": "rgba(0, 0, 0, 0.2)",
				"--dsw-alias-bg-mask-3": "rgba(0, 0, 0, 0.48)",
				"--dsw-alias-bg-module-platform": "#313244",
				"--dsw-alias-bg-multi-select": "#2b2b40",
				"--dsw-alias-bg-skeleton": "rgba(205, 214, 244, 0.08)",
				"--dsw-alias-border-l3": "rgba(205, 214, 244, 0.22)",
				"--dsw-alias-border-l4": "rgba(205, 214, 244, 0.28)",
				"--dsw-alias-border-inverted": "rgba(205, 214, 244, 0.1)",
				"--dsw-alias-button-info-fill": "#89b4fa",
				"--dsw-alias-button-info-hover": "#9cc0fb",
				"--dsw-alias-button-elevated-fill": "#242436",
				"--dsw-alias-button-floating-fill": "#2b2b40",
				"--dsw-alias-button-floating-hover": "#313244",
				"--dsw-alias-interactive-bg-hover-solid": "#313244",
				"--dsw-alias-interactive-bg-hover-danger": "rgba(243, 139, 168, 0.18)",
				"--dsw-alias-interactive-bg-hover-accent": "rgba(203, 166, 247, 0.24)",
				"--dsw-alias-label-caption": "#9399b2",
				"--dsw-alias-label-primary-inverted": "#1e1e2e",
				"--dsw-alias-label-primary-dimmed": "#a6adc8",
				"--dsw-alias-label-dimmed": "#313244",
				"--dsw-alias-markdown-citation": "#313244",
				"--dsw-alias-markdown-code-segment-selected": "#313244",
				"--dsw-alias-markdown-code-segment-unselected": "#181825",
				"--dsw-alias-markdown-placeholder": "#313244",
				"--dsw-alias-scrollbar-bg-l2": "#45475a",
				"--dsw-alias-scrollbar-hover-l2": "#6c7086",
				"--dsw-alias-state-success-secondary": "#b5e8ad",
				"--dsw-alias-state-warn-secondary": "#f2d5a8",
				"--dsw-alias-state-error-secondary": "#f5a8c0",
				"--dsw-alias-state-success-tertiary": "#233b2a",
				"--dsw-alias-state-warn-tertiary": "#3d3525",
				"--dsw-alias-state-business-tertiary": "#2a3a52",
				"--dsw-alias-toast-bg": "#45475a",
				"--dsw-specific-input-major": "#313244",
				"--dsw-specific-login-input": "#181825",
				"--dsw-specific-menu": "#313244",
				"--dsw-specific-selector": "#313244",
				"--dsw-specific-sidebar-nav-item-hover": "#313244",
				"--dsw-specific-tip": "#313244"
			})
		});
		//#endregion
		//#region ../core/src/themes/cobalt2.ts
		/**
		* Cobalt2: Wes Bos's cobalt blue with the signature yellow — editor
		* `#193549` base, line-highlight/indent-guide ladder, terminal/panel darks.
		* Business blue `#0088ff` holds ≈3.6:1 on the base, above the 3:1 accent bar;
		* text colors are upstream white/`#e1efff`/`#ccc`/`#aaa`. Button hover
		* variants are lightened. Overlay `#496d84` is interpolated one step above
		* layer-3 `#406179` so popups separate from layer-3 content.
		*/
		const cobalt2 = Object.freeze({
			id: "cobalt2",
			colorScheme: "dark",
			tokens: Object.freeze({
				"--dsw-alias-bg-base": "#193549",
				"--dsw-alias-bg-layer-1": "#1f4662",
				"--dsw-alias-bg-layer-2": "#3b5364",
				"--dsw-alias-bg-layer-3": "#406179",
				"--dsw-alias-bg-overlay": "#496d84",
				"--dsw-alias-label-primary": "#ffffff",
				"--dsw-alias-label-secondary": "#e1efff",
				"--dsw-alias-label-tertiary": "#cccccc",
				"--dsw-alias-brand-primary": "#ffc600",
				"--dsw-alias-state-business-primary": "#0088ff",
				"--dsw-alias-state-success-primary": "#3ad900",
				"--dsw-alias-state-warn-primary": "#ff9d00",
				"--dsw-alias-state-error-primary": "#ff628c",
				"--dsw-alias-border-l1": "rgba(255, 255, 255, 0.08)",
				"--dsw-alias-border-l2": "rgba(255, 255, 255, 0.15)",
				"--dsw-alias-interactive-bg-hover": "rgba(255, 255, 255, 0.06)",
				"--dsw-alias-interactive-bg-active": "rgba(255, 255, 255, 0.12)",
				"--dsw-alias-button-primary-fill": "#ffc600",
				"--dsw-alias-button-primary-hover": "#ffd133",
				"--dsw-alias-markdown-code-block": "#122738",
				"--dsw-alias-markdown-code-block-banner": "#122738",
				"--dsw-alias-markdown-inline-code": "#1f4662",
				"--dsw-alias-markdown-tag": "#1f4662",
				"--dsw-alias-scrollbar-bg-l1": "#406179",
				"--dsw-alias-scrollbar-hover-l1": "#5b7d97",
				"--dsw-alias-tooltip-bg": "#1f4662",
				"--dsw-specific-bubble": "#1f4662",
				"--dsw-specific-bubble-highlight": "#3b5364",
				"--dsw-specific-sidebar-fill": "#15232d",
				"--dsw-specific-sidebar-nav-item-active": "#1f4662",
				"--dsw-alias-bg-mask-1": "rgba(0, 0, 0, 0.5)",
				"--dsw-alias-bg-mask-2": "rgba(0, 0, 0, 0.2)",
				"--dsw-alias-bg-mask-3": "rgba(0, 0, 0, 0.48)",
				"--dsw-alias-bg-module-platform": "#1f4662",
				"--dsw-alias-bg-multi-select": "#1f4662",
				"--dsw-alias-bg-skeleton": "rgba(255, 255, 255, 0.08)",
				"--dsw-alias-border-l3": "rgba(255, 255, 255, 0.22)",
				"--dsw-alias-border-l4": "rgba(255, 255, 255, 0.28)",
				"--dsw-alias-border-inverted": "rgba(255, 255, 255, 0.1)",
				"--dsw-alias-button-info-fill": "#0088ff",
				"--dsw-alias-button-info-hover": "#33a1ff",
				"--dsw-alias-button-elevated-fill": "#1f4662",
				"--dsw-alias-button-floating-fill": "#1f4662",
				"--dsw-alias-button-floating-hover": "#3b5364",
				"--dsw-alias-interactive-bg-hover-solid": "#3b5364",
				"--dsw-alias-interactive-bg-hover-danger": "rgba(255, 98, 140, 0.18)",
				"--dsw-alias-interactive-bg-hover-accent": "rgba(255, 198, 0, 0.24)",
				"--dsw-alias-label-caption": "#aaaaaa",
				"--dsw-alias-label-primary-inverted": "#193549",
				"--dsw-alias-label-primary-dimmed": "#e1efff",
				"--dsw-alias-label-dimmed": "#3b5364",
				"--dsw-alias-markdown-citation": "#1f4662",
				"--dsw-alias-markdown-code-segment-selected": "#3b5364",
				"--dsw-alias-markdown-code-segment-unselected": "#122738",
				"--dsw-alias-markdown-placeholder": "#1f4662",
				"--dsw-alias-scrollbar-bg-l2": "#406179",
				"--dsw-alias-scrollbar-hover-l2": "#5b7d97",
				"--dsw-alias-state-success-secondary": "#64e83b",
				"--dsw-alias-state-warn-secondary": "#ffb13d",
				"--dsw-alias-state-error-secondary": "#ff84a5",
				"--dsw-alias-state-success-tertiary": "#1d3a26",
				"--dsw-alias-state-warn-tertiary": "#3d2f16",
				"--dsw-alias-state-business-tertiary": "#123449",
				"--dsw-alias-toast-bg": "#1f4662",
				"--dsw-specific-input-major": "#3b5364",
				"--dsw-specific-login-input": "#122738",
				"--dsw-specific-menu": "#3b5364",
				"--dsw-specific-selector": "#1f4662",
				"--dsw-specific-sidebar-nav-item-hover": "#1f4662",
				"--dsw-specific-tip": "#1f4662"
			})
		});
		//#endregion
		//#region ../core/src/themes/deepseek.ts
		/**
		* Clean DeepSeek-inspired blue light theme: the product's brand palette on a
		* neutral-bluish light base.
		*/
		const deepseek = Object.freeze({
			id: "deepseek",
			colorScheme: "light",
			tokens: Object.freeze({
				"--dsw-alias-bg-base": "#ffffff",
				"--dsw-alias-bg-layer-1": "#ffffff",
				"--dsw-alias-bg-layer-2": "#f5f6f7",
				"--dsw-alias-bg-layer-3": "#ededf0",
				"--dsw-alias-bg-overlay": "#ededed",
				"--dsw-alias-label-primary": "#1f1f1f",
				"--dsw-alias-label-secondary": "#616367",
				"--dsw-alias-label-tertiary": "#6b6d72",
				"--dsw-alias-brand-primary": "#4176e6",
				"--dsw-alias-state-business-primary": "#4176e6",
				"--dsw-alias-state-success-primary": "#1dab52",
				"--dsw-alias-state-warn-primary": "#ca8208",
				"--dsw-alias-state-error-primary": "#ec1313",
				"--dsw-alias-border-l1": "rgba(0, 0, 0, 0.04)",
				"--dsw-alias-border-l2": "rgba(0, 0, 0, 0.1)",
				"--dsw-alias-interactive-bg-hover": "rgba(38, 49, 72, 0.06)",
				"--dsw-alias-interactive-bg-active": "rgba(38, 49, 72, 0.1)",
				"--dsw-alias-button-primary-fill": "#1f1f1f",
				"--dsw-alias-button-primary-hover": "#3d3d40",
				"--dsw-alias-markdown-code-block": "#fafafa",
				"--dsw-alias-markdown-code-block-banner": "#fafafa",
				"--dsw-alias-markdown-inline-code": "#f5f5f5",
				"--dsw-alias-markdown-tag": "#ededed",
				"--dsw-alias-scrollbar-bg-l1": "#e5e5e5",
				"--dsw-alias-scrollbar-hover-l1": "#d4d4d4",
				"--dsw-alias-tooltip-bg": "#212121",
				"--dsw-specific-bubble": "#edf3fe",
				"--dsw-specific-bubble-highlight": "#d3e2ff",
				"--dsw-specific-sidebar-fill": "#fafafa",
				"--dsw-specific-sidebar-nav-item-active": "#f5f5f5",
				"--dsw-alias-bg-mask-1": "rgba(0, 0, 0, 0.24)",
				"--dsw-alias-bg-mask-2": "rgba(0, 0, 0, 0.12)",
				"--dsw-alias-bg-mask-3": "rgba(0, 0, 0, 0.48)",
				"--dsw-alias-bg-module-platform": "#f9fafb",
				"--dsw-alias-bg-multi-select": "#f9fafb",
				"--dsw-alias-bg-skeleton": "rgba(0, 0, 0, 0.04)",
				"--dsw-alias-border-l3": "rgba(0, 0, 0, 0.12)",
				"--dsw-alias-border-l4": "rgba(0, 0, 0, 0.16)",
				"--dsw-alias-border-inverted": "rgba(0, 0, 0, 0)",
				"--dsw-alias-button-info-fill": "#4176e6",
				"--dsw-alias-button-info-hover": "#2f63d4",
				"--dsw-alias-button-elevated-fill": "#ffffff",
				"--dsw-alias-button-floating-fill": "#ffffff",
				"--dsw-alias-button-floating-hover": "#f1f3f5",
				"--dsw-alias-interactive-bg-hover-solid": "#f1f3f5",
				"--dsw-alias-interactive-bg-hover-danger": "rgba(236, 19, 19, 0.05)",
				"--dsw-alias-interactive-bg-hover-accent": "rgba(38, 49, 72, 0.14)",
				"--dsw-alias-label-caption": "#6b6d72",
				"--dsw-alias-label-primary-inverted": "#ffffff",
				"--dsw-alias-label-primary-dimmed": "#15171a",
				"--dsw-alias-label-dimmed": "#e5e5e5",
				"--dsw-alias-markdown-citation": "#f5f5f5",
				"--dsw-alias-markdown-code-segment-selected": "#ffffff",
				"--dsw-alias-markdown-code-segment-unselected": "#f1f3f5",
				"--dsw-alias-markdown-placeholder": "#f9fafb",
				"--dsw-alias-scrollbar-bg-l2": "#e5e5e5",
				"--dsw-alias-scrollbar-hover-l2": "#d4d4d4",
				"--dsw-alias-state-success-secondary": "#4ade80",
				"--dsw-alias-state-warn-secondary": "#fbbf24",
				"--dsw-alias-state-error-secondary": "#f87171",
				"--dsw-alias-state-success-tertiary": "#e6fbee",
				"--dsw-alias-state-warn-tertiary": "#fef3e2",
				"--dsw-alias-state-business-tertiary": "#e7effd",
				"--dsw-alias-toast-bg": "#333333",
				"--dsw-specific-input-major": "#ffffff",
				"--dsw-specific-login-input": "#fafafa",
				"--dsw-specific-menu": "#ededf0",
				"--dsw-specific-selector": "#f9fafb",
				"--dsw-specific-sidebar-nav-item-hover": "#f1f3f5",
				"--dsw-specific-tip": "#f9fafb"
			})
		});
		//#endregion
		//#region ../core/src/themes/dracula.ts
		/**
		* High-contrast dark theme inspired by Dracula: purple accents over
		* near-black indigo surfaces.
		*
		* Tertiary text departs from Dracula's Comment `#6272a4`, which reaches only
		* 2.51:1 on these surfaces; the upstream palette offers no lighter mid tone.
		*/
		const dracula = Object.freeze({
			id: "dracula",
			colorScheme: "dark",
			tokens: Object.freeze({
				"--dsw-alias-bg-base": "#282a36",
				"--dsw-alias-bg-layer-1": "#2d3040",
				"--dsw-alias-bg-layer-2": "#343746",
				"--dsw-alias-bg-layer-3": "#3b3f51",
				"--dsw-alias-bg-overlay": "#44475a",
				"--dsw-alias-label-primary": "#f8f8f2",
				"--dsw-alias-label-secondary": "#c5c8c6",
				"--dsw-alias-label-tertiary": "#7280ad",
				"--dsw-alias-brand-primary": "#bd93f9",
				"--dsw-alias-state-business-primary": "#8be9fd",
				"--dsw-alias-state-success-primary": "#50fa7b",
				"--dsw-alias-state-warn-primary": "#ffb86c",
				"--dsw-alias-state-error-primary": "#ff5555",
				"--dsw-alias-border-l1": "rgba(248, 248, 242, 0.08)",
				"--dsw-alias-border-l2": "rgba(248, 248, 242, 0.15)",
				"--dsw-alias-interactive-bg-hover": "rgba(248, 248, 242, 0.06)",
				"--dsw-alias-interactive-bg-active": "rgba(248, 248, 242, 0.12)",
				"--dsw-alias-button-primary-fill": "#bd93f9",
				"--dsw-alias-button-primary-hover": "#c6a1fa",
				"--dsw-alias-markdown-code-block": "#21222c",
				"--dsw-alias-markdown-code-block-banner": "#21222c",
				"--dsw-alias-markdown-inline-code": "#343746",
				"--dsw-alias-markdown-tag": "#343746",
				"--dsw-alias-scrollbar-bg-l1": "#44475a",
				"--dsw-alias-scrollbar-hover-l1": "#6272a4",
				"--dsw-alias-tooltip-bg": "#44475a",
				"--dsw-specific-bubble": "#343746",
				"--dsw-specific-bubble-highlight": "#3b3f51",
				"--dsw-specific-sidebar-fill": "#21222c",
				"--dsw-specific-sidebar-nav-item-active": "#343746",
				"--dsw-alias-bg-mask-1": "rgba(0, 0, 0, 0.5)",
				"--dsw-alias-bg-mask-2": "rgba(0, 0, 0, 0.2)",
				"--dsw-alias-bg-mask-3": "rgba(0, 0, 0, 0.48)",
				"--dsw-alias-bg-module-platform": "#343746",
				"--dsw-alias-bg-multi-select": "#2d3040",
				"--dsw-alias-bg-skeleton": "rgba(248, 248, 242, 0.08)",
				"--dsw-alias-border-l3": "rgba(248, 248, 242, 0.22)",
				"--dsw-alias-border-l4": "rgba(248, 248, 242, 0.28)",
				"--dsw-alias-border-inverted": "rgba(248, 248, 242, 0.1)",
				"--dsw-alias-button-info-fill": "#8be9fd",
				"--dsw-alias-button-info-hover": "#9cedfd",
				"--dsw-alias-button-elevated-fill": "#2d3040",
				"--dsw-alias-button-floating-fill": "#343746",
				"--dsw-alias-button-floating-hover": "#3b3f51",
				"--dsw-alias-interactive-bg-hover-solid": "#3b3f51",
				"--dsw-alias-interactive-bg-hover-danger": "rgba(255, 85, 85, 0.18)",
				"--dsw-alias-interactive-bg-hover-accent": "rgba(189, 147, 249, 0.24)",
				"--dsw-alias-label-caption": "#7280ad",
				"--dsw-alias-label-primary-inverted": "#282a36",
				"--dsw-alias-label-primary-dimmed": "#c5c8c6",
				"--dsw-alias-label-dimmed": "#3b3f51",
				"--dsw-alias-markdown-citation": "#343746",
				"--dsw-alias-markdown-code-segment-selected": "#3b3f51",
				"--dsw-alias-markdown-code-segment-unselected": "#21222c",
				"--dsw-alias-markdown-placeholder": "#343746",
				"--dsw-alias-scrollbar-bg-l2": "#44475a",
				"--dsw-alias-scrollbar-hover-l2": "#6272a4",
				"--dsw-alias-state-success-secondary": "#69ff94",
				"--dsw-alias-state-warn-secondary": "#ffcf9d",
				"--dsw-alias-state-error-secondary": "#ff79c6",
				"--dsw-alias-state-success-tertiary": "#1e3d2c",
				"--dsw-alias-state-warn-tertiary": "#3d2f1e",
				"--dsw-alias-state-business-tertiary": "#24343d",
				"--dsw-alias-toast-bg": "#44475a",
				"--dsw-specific-input-major": "#3b3f51",
				"--dsw-specific-login-input": "#21222c",
				"--dsw-specific-menu": "#3b3f51",
				"--dsw-specific-selector": "#343746",
				"--dsw-specific-sidebar-nav-item-hover": "#343746",
				"--dsw-specific-tip": "#343746"
			})
		});
		//#endregion
		//#region ../core/src/themes/github-dark.ts
		/**
		* Familiar GitHub-style dark interface: GitHub Dark's neutral surfaces,
		* blue links, and green primary buttons.
		*/
		const githubDark = Object.freeze({
			id: "github-dark",
			colorScheme: "dark",
			tokens: Object.freeze({
				"--dsw-alias-bg-base": "#0d1117",
				"--dsw-alias-bg-layer-1": "#131a23",
				"--dsw-alias-bg-layer-2": "#161b22",
				"--dsw-alias-bg-layer-3": "#1c2430",
				"--dsw-alias-bg-overlay": "#21262d",
				"--dsw-alias-label-primary": "#e6edf3",
				"--dsw-alias-label-secondary": "#b1bac4",
				"--dsw-alias-label-tertiary": "#7d8590",
				"--dsw-alias-brand-primary": "#58a6ff",
				"--dsw-alias-state-business-primary": "#58a6ff",
				"--dsw-alias-state-success-primary": "#3fb950",
				"--dsw-alias-state-warn-primary": "#d29922",
				"--dsw-alias-state-error-primary": "#f85149",
				"--dsw-alias-border-l1": "rgba(240, 246, 252, 0.08)",
				"--dsw-alias-border-l2": "rgba(240, 246, 252, 0.15)",
				"--dsw-alias-interactive-bg-hover": "rgba(240, 246, 252, 0.06)",
				"--dsw-alias-interactive-bg-active": "rgba(240, 246, 252, 0.12)",
				"--dsw-alias-button-primary-fill": "#238636",
				"--dsw-alias-button-primary-hover": "#2ea043",
				"--dsw-alias-markdown-code-block": "#161b22",
				"--dsw-alias-markdown-code-block-banner": "#161b22",
				"--dsw-alias-markdown-inline-code": "#1c2430",
				"--dsw-alias-markdown-tag": "#1c2430",
				"--dsw-alias-scrollbar-bg-l1": "#30363d",
				"--dsw-alias-scrollbar-hover-l1": "#484f58",
				"--dsw-alias-tooltip-bg": "#21262d",
				"--dsw-specific-bubble": "#161b22",
				"--dsw-specific-bubble-highlight": "#1c2430",
				"--dsw-specific-sidebar-fill": "#010409",
				"--dsw-specific-sidebar-nav-item-active": "#161b22",
				"--dsw-alias-bg-mask-1": "rgba(0, 0, 0, 0.5)",
				"--dsw-alias-bg-mask-2": "rgba(0, 0, 0, 0.2)",
				"--dsw-alias-bg-mask-3": "rgba(0, 0, 0, 0.48)",
				"--dsw-alias-bg-module-platform": "#161b22",
				"--dsw-alias-bg-multi-select": "#131a23",
				"--dsw-alias-bg-skeleton": "rgba(240, 246, 252, 0.08)",
				"--dsw-alias-border-l3": "rgba(240, 246, 252, 0.22)",
				"--dsw-alias-border-l4": "rgba(240, 246, 252, 0.28)",
				"--dsw-alias-border-inverted": "rgba(240, 246, 252, 0.1)",
				"--dsw-alias-button-info-fill": "#58a6ff",
				"--dsw-alias-button-info-hover": "#79b8ff",
				"--dsw-alias-button-elevated-fill": "#131a23",
				"--dsw-alias-button-floating-fill": "#161b22",
				"--dsw-alias-button-floating-hover": "#1c2430",
				"--dsw-alias-interactive-bg-hover-solid": "#1c2430",
				"--dsw-alias-interactive-bg-hover-danger": "rgba(248, 81, 73, 0.18)",
				"--dsw-alias-interactive-bg-hover-accent": "rgba(88, 166, 255, 0.24)",
				"--dsw-alias-label-caption": "#7d8590",
				"--dsw-alias-label-primary-inverted": "#0d1117",
				"--dsw-alias-label-primary-dimmed": "#b1bac4",
				"--dsw-alias-label-dimmed": "#21262d",
				"--dsw-alias-markdown-citation": "#1c2430",
				"--dsw-alias-markdown-code-segment-selected": "#1c2430",
				"--dsw-alias-markdown-code-segment-unselected": "#161b22",
				"--dsw-alias-markdown-placeholder": "#1c2430",
				"--dsw-alias-scrollbar-bg-l2": "#30363d",
				"--dsw-alias-scrollbar-hover-l2": "#484f58",
				"--dsw-alias-state-success-secondary": "#56d364",
				"--dsw-alias-state-warn-secondary": "#e3b341",
				"--dsw-alias-state-error-secondary": "#ff7b72",
				"--dsw-alias-state-success-tertiary": "#1c2d22",
				"--dsw-alias-state-warn-tertiary": "#2d2516",
				"--dsw-alias-state-business-tertiary": "#1c2c47",
				"--dsw-alias-toast-bg": "#21262d",
				"--dsw-specific-input-major": "#1c2430",
				"--dsw-specific-login-input": "#161b22",
				"--dsw-specific-menu": "#1c2430",
				"--dsw-specific-selector": "#161b22",
				"--dsw-specific-sidebar-nav-item-hover": "#161b22",
				"--dsw-specific-tip": "#161b22"
			})
		});
		//#endregion
		//#region ../core/src/themes/gruvbox.ts
		/**
		* Gruvbox Dark: retro groove palette — neutral bg0 surfaces, warm orange
		* accent, bright fg text. The ladder and state primaries are from the
		* upstream palette (bg0 → bg0_soft → bg1 → bg2 → bg3, with bg0_hard as the
		* darkest surface for code blocks and the sidebar); button and
		* state-secondary hovers and tertiary state fills are lightened variants of
		* their palette entries.
		*/
		const gruvbox = Object.freeze({
			id: "gruvbox",
			colorScheme: "dark",
			tokens: Object.freeze({
				"--dsw-alias-bg-base": "#282828",
				"--dsw-alias-bg-layer-1": "#32302f",
				"--dsw-alias-bg-layer-2": "#3c3836",
				"--dsw-alias-bg-layer-3": "#504945",
				"--dsw-alias-bg-overlay": "#665c54",
				"--dsw-alias-label-primary": "#ebdbb2",
				"--dsw-alias-label-secondary": "#d5c4a1",
				"--dsw-alias-label-tertiary": "#a89984",
				"--dsw-alias-brand-primary": "#fe8019",
				"--dsw-alias-state-business-primary": "#83a598",
				"--dsw-alias-state-success-primary": "#b8bb26",
				"--dsw-alias-state-warn-primary": "#fabd2f",
				"--dsw-alias-state-error-primary": "#fb4934",
				"--dsw-alias-border-l1": "rgba(235, 219, 178, 0.08)",
				"--dsw-alias-border-l2": "rgba(235, 219, 178, 0.15)",
				"--dsw-alias-interactive-bg-hover": "rgba(235, 219, 178, 0.06)",
				"--dsw-alias-interactive-bg-active": "rgba(235, 219, 178, 0.12)",
				"--dsw-alias-button-primary-fill": "#fe8019",
				"--dsw-alias-button-primary-hover": "#fe9440",
				"--dsw-alias-markdown-code-block": "#1d2021",
				"--dsw-alias-markdown-code-block-banner": "#1d2021",
				"--dsw-alias-markdown-inline-code": "#3c3836",
				"--dsw-alias-markdown-tag": "#3c3836",
				"--dsw-alias-scrollbar-bg-l1": "#665c54",
				"--dsw-alias-scrollbar-hover-l1": "#7c6f64",
				"--dsw-alias-tooltip-bg": "#665c54",
				"--dsw-specific-bubble": "#3c3836",
				"--dsw-specific-bubble-highlight": "#504945",
				"--dsw-specific-sidebar-fill": "#1d2021",
				"--dsw-specific-sidebar-nav-item-active": "#3c3836",
				"--dsw-alias-bg-mask-1": "rgba(0, 0, 0, 0.5)",
				"--dsw-alias-bg-mask-2": "rgba(0, 0, 0, 0.2)",
				"--dsw-alias-bg-mask-3": "rgba(0, 0, 0, 0.48)",
				"--dsw-alias-bg-module-platform": "#3c3836",
				"--dsw-alias-bg-multi-select": "#32302f",
				"--dsw-alias-bg-skeleton": "rgba(235, 219, 178, 0.08)",
				"--dsw-alias-border-l3": "rgba(235, 219, 178, 0.22)",
				"--dsw-alias-border-l4": "rgba(235, 219, 178, 0.28)",
				"--dsw-alias-border-inverted": "rgba(235, 219, 178, 0.1)",
				"--dsw-alias-button-info-fill": "#83a598",
				"--dsw-alias-button-info-hover": "#9db3ab",
				"--dsw-alias-button-elevated-fill": "#32302f",
				"--dsw-alias-button-floating-fill": "#3c3836",
				"--dsw-alias-button-floating-hover": "#504945",
				"--dsw-alias-interactive-bg-hover-solid": "#504945",
				"--dsw-alias-interactive-bg-hover-danger": "rgba(251, 73, 52, 0.18)",
				"--dsw-alias-interactive-bg-hover-accent": "rgba(254, 128, 25, 0.24)",
				"--dsw-alias-label-caption": "#a89984",
				"--dsw-alias-label-primary-inverted": "#282828",
				"--dsw-alias-label-primary-dimmed": "#d5c4a1",
				"--dsw-alias-label-dimmed": "#504945",
				"--dsw-alias-markdown-citation": "#3c3836",
				"--dsw-alias-markdown-code-segment-selected": "#504945",
				"--dsw-alias-markdown-code-segment-unselected": "#1d2021",
				"--dsw-alias-markdown-placeholder": "#3c3836",
				"--dsw-alias-scrollbar-bg-l2": "#665c54",
				"--dsw-alias-scrollbar-hover-l2": "#7c6f64",
				"--dsw-alias-state-success-secondary": "#c9cc5c",
				"--dsw-alias-state-warn-secondary": "#fbca62",
				"--dsw-alias-state-error-secondary": "#fb6b5a",
				"--dsw-alias-state-success-tertiary": "#2c3021",
				"--dsw-alias-state-warn-tertiary": "#3f3520",
				"--dsw-alias-state-business-tertiary": "#26343a",
				"--dsw-alias-toast-bg": "#665c54",
				"--dsw-specific-input-major": "#504945",
				"--dsw-specific-login-input": "#1d2021",
				"--dsw-specific-menu": "#504945",
				"--dsw-specific-selector": "#3c3836",
				"--dsw-specific-sidebar-nav-item-hover": "#3c3836",
				"--dsw-specific-tip": "#3c3836"
			})
		});
		//#endregion
		//#region ../core/src/themes/nord.ts
		/**
		* Nord: arctic north-blues — nord0 surfaces, frost nord8 accent, aurora
		* state colors.
		*
		* Tertiary/caption take frost nord9 `#81a1c1`: nord3 `#4c566a` reaches only
		* ~1.7:1 on the nord0–nord2 ladder, so nord3 is confined to layer-3 and
		* scrollbar tracks and never sits under text; overlay `#566073` and scrollbar
		* hover `#5e6b82` are nord3 lightened. Borders and interactions use
		* translucent nord6 overlays. Upstream paints the sidebar the same nord0 as
		* the base; code blocks take `#272e38`, one step darker than nord0, to stay
		* distinct from the base surface. Depth comes from nord1/nord2 raised
		* surfaces. Button and state-secondary hovers are lightened variants of
		* their palette entries.
		*/
		const nord = Object.freeze({
			id: "nord",
			colorScheme: "dark",
			tokens: Object.freeze({
				"--dsw-alias-bg-base": "#2e3440",
				"--dsw-alias-bg-layer-1": "#3b4252",
				"--dsw-alias-bg-layer-2": "#434c5e",
				"--dsw-alias-bg-layer-3": "#4c566a",
				"--dsw-alias-bg-overlay": "#566073",
				"--dsw-alias-label-primary": "#eceff4",
				"--dsw-alias-label-secondary": "#d8dee9",
				"--dsw-alias-label-tertiary": "#81a1c1",
				"--dsw-alias-brand-primary": "#88c0d0",
				"--dsw-alias-state-business-primary": "#5e81ac",
				"--dsw-alias-state-success-primary": "#a3be8c",
				"--dsw-alias-state-warn-primary": "#ebcb8b",
				"--dsw-alias-state-error-primary": "#bf616a",
				"--dsw-alias-border-l1": "rgba(236, 239, 244, 0.08)",
				"--dsw-alias-border-l2": "rgba(236, 239, 244, 0.15)",
				"--dsw-alias-interactive-bg-hover": "rgba(236, 239, 244, 0.06)",
				"--dsw-alias-interactive-bg-active": "rgba(236, 239, 244, 0.12)",
				"--dsw-alias-button-primary-fill": "#88c0d0",
				"--dsw-alias-button-primary-hover": "#9ccdda",
				"--dsw-alias-markdown-code-block": "#272e38",
				"--dsw-alias-markdown-code-block-banner": "#3b4252",
				"--dsw-alias-markdown-inline-code": "#3b4252",
				"--dsw-alias-markdown-tag": "#3b4252",
				"--dsw-alias-scrollbar-bg-l1": "#4c566a",
				"--dsw-alias-scrollbar-hover-l1": "#5e6b82",
				"--dsw-alias-tooltip-bg": "#434c5e",
				"--dsw-specific-bubble": "#3b4252",
				"--dsw-specific-bubble-highlight": "#434c5e",
				"--dsw-specific-sidebar-fill": "#2e3440",
				"--dsw-specific-sidebar-nav-item-active": "#3b4252",
				"--dsw-alias-bg-mask-1": "rgba(0, 0, 0, 0.5)",
				"--dsw-alias-bg-mask-2": "rgba(0, 0, 0, 0.2)",
				"--dsw-alias-bg-mask-3": "rgba(0, 0, 0, 0.48)",
				"--dsw-alias-bg-module-platform": "#3b4252",
				"--dsw-alias-bg-multi-select": "#3b4252",
				"--dsw-alias-bg-skeleton": "rgba(236, 239, 244, 0.08)",
				"--dsw-alias-border-l3": "rgba(236, 239, 244, 0.22)",
				"--dsw-alias-border-l4": "rgba(236, 239, 244, 0.28)",
				"--dsw-alias-border-inverted": "rgba(236, 239, 244, 0.1)",
				"--dsw-alias-button-info-fill": "#5e81ac",
				"--dsw-alias-button-info-hover": "#7391b9",
				"--dsw-alias-button-elevated-fill": "#3b4252",
				"--dsw-alias-button-floating-fill": "#3b4252",
				"--dsw-alias-button-floating-hover": "#434c5e",
				"--dsw-alias-interactive-bg-hover-solid": "#434c5e",
				"--dsw-alias-interactive-bg-hover-danger": "rgba(191, 97, 106, 0.18)",
				"--dsw-alias-interactive-bg-hover-accent": "rgba(136, 192, 208, 0.24)",
				"--dsw-alias-label-caption": "#81a1c1",
				"--dsw-alias-label-primary-inverted": "#2e3440",
				"--dsw-alias-label-primary-dimmed": "#d8dee9",
				"--dsw-alias-label-dimmed": "#434c5e",
				"--dsw-alias-markdown-citation": "#3b4252",
				"--dsw-alias-markdown-code-segment-selected": "#434c5e",
				"--dsw-alias-markdown-code-segment-unselected": "#2e3440",
				"--dsw-alias-markdown-placeholder": "#3b4252",
				"--dsw-alias-scrollbar-bg-l2": "#4c566a",
				"--dsw-alias-scrollbar-hover-l2": "#5e6b82",
				"--dsw-alias-state-success-secondary": "#b7d0a5",
				"--dsw-alias-state-warn-secondary": "#f2dcae",
				"--dsw-alias-state-error-secondary": "#d47f87",
				"--dsw-alias-state-success-tertiary": "#2f3b33",
				"--dsw-alias-state-warn-tertiary": "#3f3a2e",
				"--dsw-alias-state-business-tertiary": "#2c3a4a",
				"--dsw-alias-toast-bg": "#434c5e",
				"--dsw-specific-input-major": "#434c5e",
				"--dsw-specific-login-input": "#2e3440",
				"--dsw-specific-menu": "#434c5e",
				"--dsw-specific-selector": "#3b4252",
				"--dsw-specific-sidebar-nav-item-hover": "#3b4252",
				"--dsw-specific-tip": "#3b4252"
			})
		});
		//#endregion
		//#region ../core/src/themes/oled.ts
		/**
		* True-black theme for OLED displays: pure #000 backgrounds with maximum
		* contrast foregrounds, saving power on emissive panels.
		*/
		const oled = Object.freeze({
			id: "oled",
			colorScheme: "dark",
			tokens: Object.freeze({
				"--dsw-alias-bg-base": "#000000",
				"--dsw-alias-bg-layer-1": "#050505",
				"--dsw-alias-bg-layer-2": "#0a0a0a",
				"--dsw-alias-bg-layer-3": "#0f0f0f",
				"--dsw-alias-bg-overlay": "#171717",
				"--dsw-alias-label-primary": "#f0f0f0",
				"--dsw-alias-label-secondary": "#a0a0a0",
				"--dsw-alias-label-tertiary": "#7b7b7b",
				"--dsw-alias-brand-primary": "#ffffff",
				"--dsw-alias-state-business-primary": "#e0e0e0",
				"--dsw-alias-state-success-primary": "#34d399",
				"--dsw-alias-state-warn-primary": "#fbbf24",
				"--dsw-alias-state-error-primary": "#f87171",
				"--dsw-alias-border-l1": "rgba(255, 255, 255, 0.1)",
				"--dsw-alias-border-l2": "rgba(255, 255, 255, 0.18)",
				"--dsw-alias-interactive-bg-hover": "rgba(255, 255, 255, 0.08)",
				"--dsw-alias-interactive-bg-active": "rgba(255, 255, 255, 0.16)",
				"--dsw-alias-button-primary-fill": "#ffffff",
				"--dsw-alias-button-primary-hover": "#d4d4d4",
				"--dsw-alias-markdown-code-block": "#0a0a0a",
				"--dsw-alias-markdown-code-block-banner": "#0a0a0a",
				"--dsw-alias-markdown-inline-code": "#141414",
				"--dsw-alias-markdown-tag": "#141414",
				"--dsw-alias-scrollbar-bg-l1": "#1f1f1f",
				"--dsw-alias-scrollbar-hover-l1": "#2e2e2e",
				"--dsw-alias-tooltip-bg": "#1c1c1c",
				"--dsw-specific-bubble": "#0a0a0a",
				"--dsw-specific-bubble-highlight": "#141414",
				"--dsw-specific-sidebar-fill": "#000000",
				"--dsw-specific-sidebar-nav-item-active": "#141414",
				"--dsw-alias-bg-mask-1": "rgba(0, 0, 0, 0.5)",
				"--dsw-alias-bg-mask-2": "rgba(0, 0, 0, 0.2)",
				"--dsw-alias-bg-mask-3": "rgba(0, 0, 0, 0.48)",
				"--dsw-alias-bg-module-platform": "#0f0f0f",
				"--dsw-alias-bg-multi-select": "#0a0a0a",
				"--dsw-alias-bg-skeleton": "rgba(255, 255, 255, 0.08)",
				"--dsw-alias-border-l3": "rgba(255, 255, 255, 0.24)",
				"--dsw-alias-border-l4": "rgba(255, 255, 255, 0.32)",
				"--dsw-alias-border-inverted": "rgba(255, 255, 255, 0.12)",
				"--dsw-alias-button-info-fill": "#e0e0e0",
				"--dsw-alias-button-info-hover": "#c9c9c9",
				"--dsw-alias-button-elevated-fill": "#0f0f0f",
				"--dsw-alias-button-floating-fill": "#141414",
				"--dsw-alias-button-floating-hover": "#1c1c1c",
				"--dsw-alias-interactive-bg-hover-solid": "#1c1c1c",
				"--dsw-alias-interactive-bg-hover-danger": "rgba(248, 113, 113, 0.15)",
				"--dsw-alias-interactive-bg-hover-accent": "rgba(255, 255, 255, 0.24)",
				"--dsw-alias-label-caption": "#7b7b7b",
				"--dsw-alias-label-primary-inverted": "#000000",
				"--dsw-alias-label-primary-dimmed": "#a0a0a0",
				"--dsw-alias-label-dimmed": "#171717",
				"--dsw-alias-markdown-citation": "#141414",
				"--dsw-alias-markdown-code-segment-selected": "#171717",
				"--dsw-alias-markdown-code-segment-unselected": "#0a0a0a",
				"--dsw-alias-markdown-placeholder": "#171717",
				"--dsw-alias-scrollbar-bg-l2": "#1f1f1f",
				"--dsw-alias-scrollbar-hover-l2": "#2e2e2e",
				"--dsw-alias-state-success-secondary": "#6ee7b7",
				"--dsw-alias-state-warn-secondary": "#fcd34d",
				"--dsw-alias-state-error-secondary": "#fca5a5",
				"--dsw-alias-state-success-tertiary": "#052e16",
				"--dsw-alias-state-warn-tertiary": "#292406",
				"--dsw-alias-state-business-tertiary": "#1f1f1f",
				"--dsw-alias-toast-bg": "#1c1c1c",
				"--dsw-specific-input-major": "#0f0f0f",
				"--dsw-specific-login-input": "#0a0a0a",
				"--dsw-specific-menu": "#0f0f0f",
				"--dsw-specific-selector": "#0a0a0a",
				"--dsw-specific-sidebar-nav-item-hover": "#141414",
				"--dsw-specific-tip": "#0f0f0f"
			})
		});
		//#endregion
		//#region ../core/src/themes/solarized.ts
		/**
		* Solarized Dark: Ethan Schoonover's scientific palette — teal base03
		* surfaces with the solarized yellow accent.
		*
		* Tertiary/caption take base0 `#839496`: the canonical base00/base01 grays
		* reach only ~2.9:1 on base02-family surfaces. Layer steps between base03
		* and base02 (`#05303c`) and above base02 (`#0a4150`, `#0d4858`, `#104f60`)
		* are interpolated; the palette ships no intermediate ladder. Button and
		* state-secondary hovers are lightened variants of their palette entries.
		*/
		const solarized = Object.freeze({
			id: "solarized",
			colorScheme: "dark",
			tokens: Object.freeze({
				"--dsw-alias-bg-base": "#002b36",
				"--dsw-alias-bg-layer-1": "#05303c",
				"--dsw-alias-bg-layer-2": "#073642",
				"--dsw-alias-bg-layer-3": "#0a4150",
				"--dsw-alias-bg-overlay": "#0d4858",
				"--dsw-alias-label-primary": "#eee8d5",
				"--dsw-alias-label-secondary": "#93a1a1",
				"--dsw-alias-label-tertiary": "#839496",
				"--dsw-alias-brand-primary": "#b58900",
				"--dsw-alias-state-business-primary": "#268bd2",
				"--dsw-alias-state-success-primary": "#859900",
				"--dsw-alias-state-warn-primary": "#cb4b16",
				"--dsw-alias-state-error-primary": "#dc322f",
				"--dsw-alias-border-l1": "rgba(238, 232, 213, 0.08)",
				"--dsw-alias-border-l2": "rgba(238, 232, 213, 0.15)",
				"--dsw-alias-interactive-bg-hover": "rgba(238, 232, 213, 0.06)",
				"--dsw-alias-interactive-bg-active": "rgba(238, 232, 213, 0.12)",
				"--dsw-alias-button-primary-fill": "#b58900",
				"--dsw-alias-button-primary-hover": "#caa426",
				"--dsw-alias-markdown-code-block": "#05303c",
				"--dsw-alias-markdown-code-block-banner": "#05303c",
				"--dsw-alias-markdown-inline-code": "#0a4150",
				"--dsw-alias-markdown-tag": "#0a4150",
				"--dsw-alias-scrollbar-bg-l1": "#104f60",
				"--dsw-alias-scrollbar-hover-l1": "#586e75",
				"--dsw-alias-tooltip-bg": "#0d4858",
				"--dsw-specific-bubble": "#073642",
				"--dsw-specific-bubble-highlight": "#0a4150",
				"--dsw-specific-sidebar-fill": "#05303c",
				"--dsw-specific-sidebar-nav-item-active": "#073642",
				"--dsw-alias-bg-mask-1": "rgba(0, 0, 0, 0.5)",
				"--dsw-alias-bg-mask-2": "rgba(0, 0, 0, 0.2)",
				"--dsw-alias-bg-mask-3": "rgba(0, 0, 0, 0.48)",
				"--dsw-alias-bg-module-platform": "#073642",
				"--dsw-alias-bg-multi-select": "#05303c",
				"--dsw-alias-bg-skeleton": "rgba(238, 232, 213, 0.08)",
				"--dsw-alias-border-l3": "rgba(238, 232, 213, 0.22)",
				"--dsw-alias-border-l4": "rgba(238, 232, 213, 0.28)",
				"--dsw-alias-border-inverted": "rgba(238, 232, 213, 0.1)",
				"--dsw-alias-button-info-fill": "#268bd2",
				"--dsw-alias-button-info-hover": "#4196da",
				"--dsw-alias-button-elevated-fill": "#05303c",
				"--dsw-alias-button-floating-fill": "#073642",
				"--dsw-alias-button-floating-hover": "#0a4150",
				"--dsw-alias-interactive-bg-hover-solid": "#0a4150",
				"--dsw-alias-interactive-bg-hover-danger": "rgba(220, 50, 47, 0.18)",
				"--dsw-alias-interactive-bg-hover-accent": "rgba(181, 137, 0, 0.24)",
				"--dsw-alias-label-caption": "#839496",
				"--dsw-alias-label-primary-inverted": "#002b36",
				"--dsw-alias-label-primary-dimmed": "#93a1a1",
				"--dsw-alias-label-dimmed": "#0d4858",
				"--dsw-alias-markdown-citation": "#0a4150",
				"--dsw-alias-markdown-code-segment-selected": "#0d4858",
				"--dsw-alias-markdown-code-segment-unselected": "#002b36",
				"--dsw-alias-markdown-placeholder": "#0a4150",
				"--dsw-alias-scrollbar-bg-l2": "#104f60",
				"--dsw-alias-scrollbar-hover-l2": "#586e75",
				"--dsw-alias-state-success-secondary": "#a8b826",
				"--dsw-alias-state-warn-secondary": "#d96b3a",
				"--dsw-alias-state-error-secondary": "#e86a5f",
				"--dsw-alias-state-success-tertiary": "#1c3323",
				"--dsw-alias-state-warn-tertiary": "#3a2c1c",
				"--dsw-alias-state-business-tertiary": "#123243",
				"--dsw-alias-toast-bg": "#104f60",
				"--dsw-specific-input-major": "#0d4858",
				"--dsw-specific-login-input": "#05303c",
				"--dsw-specific-menu": "#0d4858",
				"--dsw-specific-selector": "#073642",
				"--dsw-specific-sidebar-nav-item-hover": "#073642",
				"--dsw-specific-tip": "#073642"
			})
		});
		//#endregion
		//#region ../core/src/themes/synthwave-84.ts
		/**
		* Synthwave '84: neon pink and cyan over a deep violet night — robb0wen's
		* retro-futurescape. Surfaces are the upstream workbench backgrounds
		* (`#241b2f`, `#262335`, `#2a2139`, `#34294f`, `#463465`, `#232530`,
		* `#171520`); text is upstream white/gray/comment; accents are the neon
		* token colors. Button hover variants are lightened. No contrast
		* substitutions were needed.
		*/
		const synthwave84 = Object.freeze({
			id: "synthwave-84",
			colorScheme: "dark",
			tokens: Object.freeze({
				"--dsw-alias-bg-base": "#241b2f",
				"--dsw-alias-bg-layer-1": "#262335",
				"--dsw-alias-bg-layer-2": "#2a2139",
				"--dsw-alias-bg-layer-3": "#34294f",
				"--dsw-alias-bg-overlay": "#463465",
				"--dsw-alias-label-primary": "#ffffff",
				"--dsw-alias-label-secondary": "#b6b1b1",
				"--dsw-alias-label-tertiary": "#848bbd",
				"--dsw-alias-brand-primary": "#ff7edb",
				"--dsw-alias-state-business-primary": "#36f9f6",
				"--dsw-alias-state-success-primary": "#72f1b8",
				"--dsw-alias-state-warn-primary": "#fede5d",
				"--dsw-alias-state-error-primary": "#fe4450",
				"--dsw-alias-border-l1": "rgba(255, 255, 255, 0.08)",
				"--dsw-alias-border-l2": "rgba(255, 255, 255, 0.15)",
				"--dsw-alias-interactive-bg-hover": "rgba(255, 255, 255, 0.06)",
				"--dsw-alias-interactive-bg-active": "rgba(255, 255, 255, 0.12)",
				"--dsw-alias-button-primary-fill": "#ff7edb",
				"--dsw-alias-button-primary-hover": "#ff98e3",
				"--dsw-alias-markdown-code-block": "#232530",
				"--dsw-alias-markdown-code-block-banner": "#232530",
				"--dsw-alias-markdown-inline-code": "#2a2139",
				"--dsw-alias-markdown-tag": "#2a2139",
				"--dsw-alias-scrollbar-bg-l1": "#463465",
				"--dsw-alias-scrollbar-hover-l1": "#495495",
				"--dsw-alias-tooltip-bg": "#34294f",
				"--dsw-specific-bubble": "#2a2139",
				"--dsw-specific-bubble-highlight": "#34294f",
				"--dsw-specific-sidebar-fill": "#171520",
				"--dsw-specific-sidebar-nav-item-active": "#2a2139",
				"--dsw-alias-bg-mask-1": "rgba(0, 0, 0, 0.5)",
				"--dsw-alias-bg-mask-2": "rgba(0, 0, 0, 0.2)",
				"--dsw-alias-bg-mask-3": "rgba(0, 0, 0, 0.48)",
				"--dsw-alias-bg-module-platform": "#2a2139",
				"--dsw-alias-bg-multi-select": "#262335",
				"--dsw-alias-bg-skeleton": "rgba(255, 255, 255, 0.08)",
				"--dsw-alias-border-l3": "rgba(255, 255, 255, 0.22)",
				"--dsw-alias-border-l4": "rgba(255, 255, 255, 0.28)",
				"--dsw-alias-border-inverted": "rgba(255, 255, 255, 0.1)",
				"--dsw-alias-button-info-fill": "#36f9f6",
				"--dsw-alias-button-info-hover": "#5ffbf8",
				"--dsw-alias-button-elevated-fill": "#262335",
				"--dsw-alias-button-floating-fill": "#2a2139",
				"--dsw-alias-button-floating-hover": "#34294f",
				"--dsw-alias-interactive-bg-hover-solid": "#34294f",
				"--dsw-alias-interactive-bg-hover-danger": "rgba(254, 68, 80, 0.18)",
				"--dsw-alias-interactive-bg-hover-accent": "rgba(255, 126, 219, 0.24)",
				"--dsw-alias-label-caption": "#848bbd",
				"--dsw-alias-label-primary-inverted": "#241b2f",
				"--dsw-alias-label-primary-dimmed": "#b6b1b1",
				"--dsw-alias-label-dimmed": "#34294f",
				"--dsw-alias-markdown-citation": "#2a2139",
				"--dsw-alias-markdown-code-segment-selected": "#34294f",
				"--dsw-alias-markdown-code-segment-unselected": "#171520",
				"--dsw-alias-markdown-placeholder": "#2a2139",
				"--dsw-alias-scrollbar-bg-l2": "#463465",
				"--dsw-alias-scrollbar-hover-l2": "#495495",
				"--dsw-alias-state-success-secondary": "#97f5cb",
				"--dsw-alias-state-warn-secondary": "#fee97e",
				"--dsw-alias-state-error-secondary": "#fe7580",
				"--dsw-alias-state-success-tertiary": "#1d3a2f",
				"--dsw-alias-state-warn-tertiary": "#3d3620",
				"--dsw-alias-state-business-tertiary": "#1e3a46",
				"--dsw-alias-toast-bg": "#34294f",
				"--dsw-specific-input-major": "#34294f",
				"--dsw-specific-login-input": "#171520",
				"--dsw-specific-menu": "#34294f",
				"--dsw-specific-selector": "#2a2139",
				"--dsw-specific-sidebar-nav-item-hover": "#2a2139",
				"--dsw-specific-tip": "#2a2139"
			})
		});
		//#endregion
		//#region ../core/src/themes/tokyo-night.ts
		/**
		* Modern dark theme inspired by Tokyo Night: midnight-blue surfaces with
		* neon-blue and lavender accents.
		*
		* Tertiary text uses the palette's `dark5` rather than its comment colour,
		* which reaches only 2.35:1 on these surfaces.
		*/
		const tokyoNight = Object.freeze({
			id: "tokyo-night",
			colorScheme: "dark",
			tokens: Object.freeze({
				"--dsw-alias-bg-base": "#1a1b26",
				"--dsw-alias-bg-layer-1": "#1f2030",
				"--dsw-alias-bg-layer-2": "#24283b",
				"--dsw-alias-bg-layer-3": "#2c3044",
				"--dsw-alias-bg-overlay": "#3b4261",
				"--dsw-alias-label-primary": "#c0caf5",
				"--dsw-alias-label-secondary": "#a9b1d6",
				"--dsw-alias-label-tertiary": "#737aa2",
				"--dsw-alias-brand-primary": "#7aa2f7",
				"--dsw-alias-state-business-primary": "#7dcfff",
				"--dsw-alias-state-success-primary": "#9ece6a",
				"--dsw-alias-state-warn-primary": "#e0af68",
				"--dsw-alias-state-error-primary": "#f7768e",
				"--dsw-alias-border-l1": "rgba(192, 202, 245, 0.08)",
				"--dsw-alias-border-l2": "rgba(192, 202, 245, 0.15)",
				"--dsw-alias-interactive-bg-hover": "rgba(192, 202, 245, 0.06)",
				"--dsw-alias-interactive-bg-active": "rgba(192, 202, 245, 0.12)",
				"--dsw-alias-button-primary-fill": "#7aa2f7",
				"--dsw-alias-button-primary-hover": "#8cb0f8",
				"--dsw-alias-markdown-code-block": "#16161e",
				"--dsw-alias-markdown-code-block-banner": "#16161e",
				"--dsw-alias-markdown-inline-code": "#24283b",
				"--dsw-alias-markdown-tag": "#24283b",
				"--dsw-alias-scrollbar-bg-l1": "#3b4261",
				"--dsw-alias-scrollbar-hover-l1": "#565f89",
				"--dsw-alias-tooltip-bg": "#24283b",
				"--dsw-specific-bubble": "#24283b",
				"--dsw-specific-bubble-highlight": "#2c3044",
				"--dsw-specific-sidebar-fill": "#16161e",
				"--dsw-specific-sidebar-nav-item-active": "#24283b",
				"--dsw-alias-bg-mask-1": "rgba(0, 0, 0, 0.5)",
				"--dsw-alias-bg-mask-2": "rgba(0, 0, 0, 0.2)",
				"--dsw-alias-bg-mask-3": "rgba(0, 0, 0, 0.48)",
				"--dsw-alias-bg-module-platform": "#24283b",
				"--dsw-alias-bg-multi-select": "#1f2030",
				"--dsw-alias-bg-skeleton": "rgba(192, 202, 245, 0.08)",
				"--dsw-alias-border-l3": "rgba(192, 202, 245, 0.22)",
				"--dsw-alias-border-l4": "rgba(192, 202, 245, 0.28)",
				"--dsw-alias-border-inverted": "rgba(192, 202, 245, 0.1)",
				"--dsw-alias-button-info-fill": "#7dcfff",
				"--dsw-alias-button-info-hover": "#92d8ff",
				"--dsw-alias-button-elevated-fill": "#1f2030",
				"--dsw-alias-button-floating-fill": "#24283b",
				"--dsw-alias-button-floating-hover": "#2c3044",
				"--dsw-alias-interactive-bg-hover-solid": "#2c3044",
				"--dsw-alias-interactive-bg-hover-danger": "rgba(247, 118, 142, 0.18)",
				"--dsw-alias-interactive-bg-hover-accent": "rgba(122, 162, 247, 0.24)",
				"--dsw-alias-label-caption": "#737aa2",
				"--dsw-alias-label-primary-inverted": "#1a1b26",
				"--dsw-alias-label-primary-dimmed": "#a9b1d6",
				"--dsw-alias-label-dimmed": "#2c3044",
				"--dsw-alias-markdown-citation": "#24283b",
				"--dsw-alias-markdown-code-segment-selected": "#2c3044",
				"--dsw-alias-markdown-code-segment-unselected": "#16161e",
				"--dsw-alias-markdown-placeholder": "#24283b",
				"--dsw-alias-scrollbar-bg-l2": "#3b4261",
				"--dsw-alias-scrollbar-hover-l2": "#565f89",
				"--dsw-alias-state-success-secondary": "#b9f27c",
				"--dsw-alias-state-warn-secondary": "#e5b578",
				"--dsw-alias-state-error-secondary": "#f596a8",
				"--dsw-alias-state-success-tertiary": "#1f331f",
				"--dsw-alias-state-warn-tertiary": "#332a1c",
				"--dsw-alias-state-business-tertiary": "#1f2b40",
				"--dsw-alias-toast-bg": "#24283b",
				"--dsw-specific-input-major": "#2c3044",
				"--dsw-specific-login-input": "#16161e",
				"--dsw-specific-menu": "#2c3044",
				"--dsw-specific-selector": "#24283b",
				"--dsw-specific-sidebar-nav-item-hover": "#24283b",
				"--dsw-specific-tip": "#24283b"
			})
		});
		//#endregion
		//#region ../core/src/themes/index.ts
		/** All shipped themes in catalog order. */
		const themes = Object.freeze([
			deepseek,
			oled,
			dracula,
			catppuccin,
			tokyoNight,
			githubDark,
			solarized,
			gruvbox,
			nord,
			synthwave84,
			cobalt2
		]);
		//#endregion
		//#region ../core/src/index.ts
		/**
		* Register every shipped theme into a host theme registry (the host's
		* `ctx.theme` service satisfies {@link ThemeRegistry} structurally).
		*
		* @param registry - the theme registry that owns durable preference state.
		* @returns disposer that unregisters all themes registered by this call.
		*/
		function registerThemes(registry) {
			const disposers = themes.map((theme) => registry.register(theme));
			return () => {
				for (const dispose of disposers) dispose();
			};
		}
		//#endregion
		//#region src/preference.ts
		/**
		* Durable selection contract for third-party themes.
		*
		* The host's built-in theme schema (`ui-theme.preference`) only accepts
		* `light`/`dark`/`system`, so this plugin owns its own settings namespace for
		* third-party ids. The value `system` is the sentinel meaning "no override —
		* follow the host preference".
		*
		* Both halves of the plugin import this module, so it stays free of host
		* packages: the browser module table serves platform seed words and shell-own
		* modules only, and a client bundle requiring anything else fails to load.
		* The schemastery envelope built on these names lives in `./schema.ts`, which
		* only the Node half imports.
		*/
		/** Settings namespace owned by the picker plugin. */
		const THEMES_NAMESPACE = "dsh-themes";
		/** Field carrying the selected third-party theme id (or `system`). */
		const THEME_FIELD = "theme";
		/** Durable marker meaning "no third-party override; follow the host". */
		const DEFAULT_SELECTION = "system";
		/**
		* Narrow one wire or registry value to a persistable selection.
		* @param value - value crossing the settings boundary.
		* @returns whether the value is a string selection.
		*/
		function isThemeSelection(value) {
			return typeof value === "string";
		}
		//#endregion
		//#region src/picker.ts
		const BUILTIN_IDS$1 = /* @__PURE__ */ new Set(["light", "dark"]);
		/**
		* Assemble a picker over the host theme service and the durable settings
		* scope. All reads go through the service snapshot; all writes either the
		* service (selection) or the scope (durability).
		*/
		function createPicker(theme, scope) {
			/**
			* Adopt the persisted third-party selection once the durable scope is
			* ready. The host SettingsScope performs its initial read in the
			* background (activation never blocks on it), so this runs both at
			* creation and on every scope update until a registered value lands;
			* `setTheme` with an unchanged id is a host-side no-op, so retries are
			* safe.
			*/
			const tryRestore = () => {
				const snapshot = scope.getSnapshot();
				if (snapshot.status !== "ready") return;
				const persisted = snapshot.value?.theme;
				if (!isThemeSelection(persisted) || persisted === "system") return;
				if (!theme.getTheme().themes.some((candidate) => candidate.id === persisted)) return;
				theme.setTheme(persisted);
			};
			const unsubScope = scope.subscribe(tryRestore);
			tryRestore();
			return {
				getTheme() {
					return theme.getTheme();
				},
				restore() {
					tryRestore();
				},
				async sync(payload) {
					const activeId = payload.active.id;
					if (BUILTIN_IDS$1.has(activeId)) {
						const current = scope.getSnapshot().value?.theme;
						if (current !== void 0 && current !== "system") await scope.set(THEME_FIELD, DEFAULT_SELECTION);
						return;
					}
					if (scope.getSnapshot().value?.theme === activeId) return;
					await scope.set(THEME_FIELD, activeId);
				},
				setTheme(id) {
					theme.setTheme(id);
				},
				dispose() {
					unsubScope();
				}
			};
		}
		//#endregion
		//#region src/store.ts
		/**
		* Declare the picker row state and its single write action. The slot
		* machinery binds the `useStore` hook and baked `actions` from this handle;
		* the plugin's apply-world change listener is the only writer.
		*/
		function createPickerStore() {
			return (0, _deepseek_ai_dsh_client_runtime_client.defineStore)({
				init: () => ({
					preference: "system",
					activeId: "dark",
					themes: [],
					revision: -1
				}),
				actions: { sync: (draft, state) => {
					if (state.revision <= draft.revision) return;
					draft.preference = state.preference;
					draft.activeId = state.activeId;
					draft.themes = state.themes;
					draft.revision = state.revision;
				} }
			});
		}
		//#endregion
		//#region src/locales.ts
		const en = {
			"picker.title": "Theme",
			"picker.light": "Light",
			"picker.dark": "Dark",
			"picker.system": "System",
			"theme.deepseek": "DeepSeek",
			"theme.oled": "OLED",
			"theme.dracula": "Dracula",
			"theme.catppuccin": "Catppuccin",
			"theme.tokyo-night": "Tokyo Night",
			"theme.github-dark": "GitHub Dark",
			"theme.solarized": "Solarized",
			"theme.gruvbox": "Gruvbox",
			"theme.nord": "Nord",
			"theme.synthwave-84": "Synthwave '84",
			"theme.cobalt2": "Cobalt2"
		};
		const zh = {
			"picker.title": "主题",
			"picker.light": "浅色",
			"picker.dark": "深色",
			"picker.system": "跟随系统",
			"theme.deepseek": "DeepSeek",
			"theme.oled": "OLED",
			"theme.dracula": "德古拉",
			"theme.catppuccin": "卡布奇诺",
			"theme.tokyo-night": "东京之夜",
			"theme.github-dark": "GitHub 深色",
			"theme.solarized": "Solarized",
			"theme.gruvbox": "Gruvbox",
			"theme.nord": "Nord",
			"theme.synthwave-84": "Synthwave '84",
			"theme.cobalt2": "Cobalt2"
		};
		//#endregion
		//#region ../../node_modules/.pnpm/clsx@2.1.1/node_modules/clsx/dist/clsx.mjs
		function r(e) {
			var t, f, n = "";
			if ("string" == typeof e || "number" == typeof e) n += e;
			else if ("object" == typeof e) if (Array.isArray(e)) {
				var o = e.length;
				for (t = 0; t < o; t++) e[t] && (f = r(e[t])) && (n && (n += " "), n += f);
			} else for (f in e) e[f] && (n && (n += " "), n += f);
			return n;
		}
		function clsx() {
			for (var e, t, f = 0, n = "", o = arguments.length; f < o; f++) (e = arguments[f]) && (t = r(e)) && (n && (n += " "), n += t);
			return n;
		}
		//#endregion
		//#region \0dsh-css:/home/runner/work/deepseek-harness-themes/deepseek-harness-themes/packages/ui/src/ThemePickerRow.module.css.mjs
		const css = "._3ygjba_group{flex-direction:column;gap:8px;display:flex}._3ygjba_title{color:var(--dsw-alias-label-primary);font-size:14px;line-height:20px}._3ygjba_cubeRow{gap:8px;display:flex}._3ygjba_themeList{grid-template-columns:repeat(auto-fill,minmax(132px,1fr));gap:8px;margin-top:8px;display:grid}._3ygjba_themeCube,._3ygjba_themeItem{background:var(--dsw-alias-button-elevated-fill);color:var(--dsw-alias-label-secondary);border:1px solid var(--dsw-alias-border-l1);cursor:pointer;transition:background-color .12s,border-color .12s,color .12s}._3ygjba_themeCube:hover,._3ygjba_themeItem:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}._3ygjba_themeCube:focus-visible,._3ygjba_themeItem:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}._3ygjba_themeCube._3ygjba_selected,._3ygjba_themeItem._3ygjba_selected{background:var(--dsw-alias-interactive-bg-active);border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary)}._3ygjba_themeCube{border-radius:6px;flex:1;padding:6px 10px;font-size:13px;line-height:18px}._3ygjba_themeItem{text-align:left;border-radius:8px;align-items:center;gap:8px;padding:6px 9px;font-size:12px;line-height:18px;display:flex}._3ygjba_swatch{width:20px;height:20px;box-shadow:inset 0 0 0 1px var(--dsw-alias-border-l2);border-radius:5px;flex:none;align-items:flex-end;display:flex;overflow:hidden}._3ygjba_swatchAccent{width:100%;height:6px;display:block}._3ygjba_themeName{text-overflow:ellipsis;white-space:nowrap;overflow:hidden}._3ygjba_tick{background:var(--dsw-alias-brand-primary);opacity:0;border-radius:50%;flex:none;width:6px;height:6px;margin-left:auto}._3ygjba_themeItem._3ygjba_selected ._3ygjba_tick{opacity:1}@media (prefers-reduced-motion:reduce){._3ygjba_themeCube,._3ygjba_themeItem{transition:none}}";
		const tagId = "@dshthemes/ui/ThemePickerRow.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@dshthemes/ui";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var ThemePickerRow_module_css_default = {
			"selected": "_3ygjba_selected",
			"group": "_3ygjba_group",
			"title": "_3ygjba_title",
			"themeList": "_3ygjba_themeList",
			"themeCube": "_3ygjba_themeCube",
			"themeItem": "_3ygjba_themeItem",
			"swatch": "_3ygjba_swatch",
			"swatchAccent": "_3ygjba_swatchAccent",
			"cubeRow": "_3ygjba_cubeRow",
			"themeName": "_3ygjba_themeName",
			"tick": "_3ygjba_tick"
		};
		//#endregion
		//#region src/ThemePickerRow.tsx
		const BUILTINS = [
			{
				id: "light",
				labelKey: "picker.light"
			},
			{
				id: "dark",
				labelKey: "picker.dark"
			},
			{
				id: "system",
				labelKey: "picker.system"
			}
		];
		const BUILTIN_IDS = new Set(BUILTINS.map((entry) => entry.id));
		/** Keyboard steps the radiogroup answers to; other keys fall through. */
		const STEPS = {
			ArrowRight: 1,
			ArrowDown: 1,
			ArrowLeft: -1,
			ArrowUp: -1,
			Home: "home",
			End: "end"
		};
		/**
		* Title-case a theme id so a theme registered by another plugin still reads
		* as a name when this package's dictionary has no entry for it.
		*/
		function humanize(id) {
			return id.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
		}
		/**
		* Theme picker row: the built-in preference cubes plus one swatched entry per
		* registered third-party theme, all inside one radiogroup because the
		* preference holds a single value. Selection goes through the injected
		* `setTheme`; the checked state follows the preference.
		*/
		function ThemePickerRow({ useStore, t, setTheme, faces }) {
			const preference = useStore((state) => state.preference);
			const thirdParty = useStore((state) => state.themes).filter((theme) => !BUILTIN_IDS.has(theme.id));
			const ids = [...BUILTINS.map((entry) => entry.id), ...thirdParty.map((theme) => theme.id)];
			const checkedIndex = ids.indexOf(preference);
			/** Arrow keys move the selection, matching the WAI-ARIA radiogroup pattern. */
			const onKeyDown = (event) => {
				const step = STEPS[event.key];
				if (step === void 0) return;
				event.preventDefault();
				const size = ids.length;
				const to = step === "home" ? 0 : step === "end" ? size - 1 : (Math.max(checkedIndex, 0) + step + size) % size;
				const nextId = ids[to];
				setTheme(nextId);
				event.currentTarget.querySelector(`[data-theme-id="${nextId}"]`).focus();
			};
			/** Shared radio wiring so the cubes and the swatch grid stay one group. */
			const radioProps = (id) => ({
				type: "button",
				role: "radio",
				"aria-checked": preference === id,
				"data-theme-id": id,
				tabIndex: (checkedIndex < 0 ? id === ids[0] : preference === id) ? 0 : -1,
				onClick: () => {
					setTheme(id);
				}
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: ThemePickerRow_module_css_default.group,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: ThemePickerRow_module_css_default.title,
					id: "dsh-themes-label",
					children: t("picker.title")
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					role: "radiogroup",
					"aria-labelledby": "dsh-themes-label",
					onKeyDown,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: ThemePickerRow_module_css_default.cubeRow,
						children: BUILTINS.map(({ id, labelKey }) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							...radioProps(id),
							className: clsx(ThemePickerRow_module_css_default.themeCube, preference === id && ThemePickerRow_module_css_default.selected),
							children: t(labelKey)
						}, id))
					}), thirdParty.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: ThemePickerRow_module_css_default.themeList,
						children: thirdParty.map((theme) => {
							const face = faces[theme.id];
							return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								...radioProps(theme.id),
								className: clsx(ThemePickerRow_module_css_default.themeItem, preference === theme.id && ThemePickerRow_module_css_default.selected),
								children: [
									face !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										"data-swatch": "",
										"aria-hidden": "true",
										className: ThemePickerRow_module_css_default.swatch,
										style: { background: face.base },
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: ThemePickerRow_module_css_default.swatchAccent,
											style: { background: face.accent }
										})
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: ThemePickerRow_module_css_default.themeName,
										children: face === void 0 ? humanize(theme.id) : t(`theme.${theme.id}`)
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										"aria-hidden": "true",
										className: ThemePickerRow_module_css_default.tick
									})
								]
							}, theme.id);
						})
					})]
				})]
			});
		}
		//#endregion
		//#region src/client.ts
		/** Locale namespace owning this row's copy. */
		const SETTINGS_NS = "settings.dsh-themes";
		/**
		* Swatch colours for every shipped theme, read from the catalog this package
		* already bundles. The host theme snapshot carries no token payload, so the
		* picker gets its preview colours from here rather than widening that
		* contract. Themes absent from this table (registered by another plugin)
		* render without a swatch and under a humanized id.
		*/
		const THEME_FACES = Object.freeze(Object.fromEntries(themes.map((theme) => [theme.id, Object.freeze({
			base: theme.tokens["--dsw-alias-bg-base"],
			accent: theme.tokens["--dsw-alias-brand-primary"]
		})])));
		/** Services this plugin consumes. */
		const inject = [
			"theme",
			"settingsScope",
			"slots",
			"locale"
		];
		/**
		* Client plugin body: register all shipped themes, own the durable
		* third-party selection, and inject the picker row into the settings General
		* section (id `themes`, order 11 — right after the host Appearance row).
		*/
		function apply(ctx) {
			ctx.effect(() => registerThemes(ctx.theme), "dsh-themes: register themes");
			const scope = ctx.settingsScope.bind({ namespace: THEMES_NAMESPACE });
			ctx.effect(() => ctx.locale.register(SETTINGS_NS, {
				en,
				zh
			}), "dsh-themes: picker locale");
			const picker = createPicker(ctx.theme, scope);
			const store = createPickerStore();
			const mirror = () => {
				const snapshot = picker.getTheme();
				return {
					preference: snapshot.preference,
					activeId: snapshot.active.id,
					themes: snapshot.themes,
					revision: snapshot.revision
				};
			};
			let bound;
			const syncStore = () => {
				bound?.sync(mirror());
			};
			ctx.effect(() => {
				const offChange = ctx.on("theme/change", (payload) => {
					picker.sync(payload);
					syncStore();
				});
				picker.restore();
				syncStore();
				return () => {
					offChange();
					picker.dispose();
				};
			}, "dsh-themes: picker lifecycle");
			ctx.slots.inject("settings.general.item", () => ctx.slots.register({
				name: "settings.general.item",
				id: "themes",
				order: 11,
				store,
				locale: SETTINGS_NS,
				inject: (actions) => {
					bound = actions;
					syncStore();
					return {
						faces: THEME_FACES,
						setTheme: (id) => {
							picker.setTheme(id);
						}
					};
				}
			}, ThemePickerRow));
		}
		//#endregion
		exports.SETTINGS_NS = SETTINGS_NS;
		exports.THEME_FACES = THEME_FACES;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
