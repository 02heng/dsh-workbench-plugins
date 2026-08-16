import { workThemeCss } from "./theme.css.js"

export function atelierHtml() {
	return `<!doctype html>
<html lang="zh-CN"><head>
<meta charset="utf-8"/>
<title>工作台账</title>
<style>${workThemeCss()}</style>
</head>
<body class="atelier">
<div id="app"></div>
<script type="module">
import { mountAtelier } from "/plugins/dsh-dashboard/atelier.js";
mountAtelier(document.getElementById("app"));
</script>
</body></html>`
}
