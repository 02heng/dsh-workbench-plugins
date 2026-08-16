export function paperTheme() {
	return {
		color: ["#0f5c56", "#c4a35a", "#2f6b4f", "#8a5a12", "#6b645b", "#8f2d2d", "#3d6b8a", "#5c4a32"],
		backgroundColor: "transparent",
		textStyle: { fontFamily: "IBM Plex Sans, Noto Sans SC, sans-serif", color: "#1b1916" },
		title: { textStyle: { fontFamily: "Cormorant Garamond, Noto Serif SC, serif", color: "#1b1916", fontWeight: 600 } },
		legend: { textStyle: { color: "#6b645b" } },
		tooltip: { backgroundColor: "#fffdf8", borderColor: "#d8cfc0", textStyle: { color: "#1b1916" } },
		grid: { left: 42, right: 18, top: 36, bottom: 28, containLabel: true },
	}
}

function weeks() {
	return ["第1周", "第2周", "第3周", "第4周", "第5周", "第6周", "第7周", "第8周"]
}

export function chartSpecs() {
	const grades = ["初一", "初二", "初三", "高一", "高二", "高三"]
	return [
		{ id: "bar", title: "各年级在籍", kind: "柱状", wide: false, option: {
			tooltip: { trigger: "axis" },
			xAxis: { type: "category", data: grades },
			yAxis: { type: "value", name: "人" },
			series: [{ type: "bar", data: [412, 398, 381, 356, 344, 329], barWidth: "46%", itemStyle: { borderRadius: [6, 6, 0, 0] } }],
		} },
		{ id: "line", title: "到课率走势", kind: "折线", wide: true, option: {
			tooltip: { trigger: "axis" },
			legend: { data: ["到课率", "请假率"] },
			xAxis: { type: "category", data: weeks() },
			yAxis: { type: "value", min: 0, max: 100, axisLabel: { formatter: "{value}%" } },
			series: [
				{ name: "到课率", type: "line", smooth: true, data: [96.2, 95.8, 97.1, 94.6, 96.8, 97.4, 95.1, 96.9] },
				{ name: "请假率", type: "line", smooth: true, data: [2.1, 2.4, 1.8, 3.2, 2.0, 1.6, 2.8, 2.2] },
			],
		} },
		{ id: "pie", title: "学段结构", kind: "饼图", option: {
			tooltip: { trigger: "item" },
			series: [{ type: "pie", radius: ["0%", "68%"], data: [
				{ name: "初中", value: 1191 }, { name: "高中", value: 1029 }, { name: "中职班", value: 86 },
			] }],
		} },
		{ id: "ring", title: "学期及格构成", kind: "环形", option: {
			tooltip: { trigger: "item" },
			series: [{ type: "pie", radius: ["46%", "70%"], data: [
				{ name: "优秀", value: 28 }, { name: "良好", value: 41 }, { name: "及格", value: 24 }, { name: "待补", value: 7 },
			] }],
		} },
		{ id: "gauge", title: "本周到课率", kind: "仪表", option: {
			series: [{ type: "gauge", min: 80, max: 100, progress: { show: true, width: 12 },
				axisLine: { lineStyle: { width: 12 } }, pointer: { length: "62%" },
				detail: { valueAnimation: true, formatter: "{value}%", fontSize: 22 },
				data: [{ value: 96.9, name: "到课" }] }],
		} },
		{ id: "radar", title: "五育雷达", kind: "雷达", option: {
			radar: { indicator: [
				{ name: "德", max: 100 }, { name: "智", max: 100 }, { name: "体", max: 100 },
				{ name: "美", max: 100 }, { name: "劳", max: 100 },
			] },
			series: [{ type: "radar", data: [
				{ name: "本校", value: [86, 91, 78, 82, 80] },
				{ name: "区均", value: [80, 84, 76, 74, 73] },
			] }],
		} },
		{ id: "scatter", title: "作业量与正确率", kind: "散点", option: {
			tooltip: { trigger: "item" },
			xAxis: { name: "周作业份", min: 4, max: 16 },
			yAxis: { name: "正确率%", min: 60, max: 100 },
			series: [{ type: "scatter", symbolSize: 12, data: [
				[6, 88], [8, 86], [9, 91], [11, 84], [7, 93], [13, 79], [10, 87], [12, 82], [5, 90], [14, 76],
			] }],
		} },
		{ id: "heat", title: "课表占用热力", kind: "热力", wide: true, option: {
			tooltip: {},
			xAxis: { type: "category", data: ["一", "二", "三", "四", "五"] },
			yAxis: { type: "category", data: ["1", "2", "3", "4", "5", "6", "7", "8"] },
			visualMap: { min: 0, max: 36, orient: "horizontal", left: "center", bottom: 0, inRange: { color: ["#f4efe6", "#0f5c56"] } },
			series: [{ type: "heatmap", data: Array.from({ length: 40 }, (_, i) => [i % 5, Math.floor(i / 5), 8 + ((i * 7) % 28)]) }],
		} },
		{ id: "funnel", title: "招生漏斗", kind: "漏斗", option: {
			tooltip: { trigger: "item" },
			series: [{ type: "funnel", left: "12%", width: "76%", data: [
				{ name: "咨询", value: 860 }, { name: "报名", value: 540 }, { name: "面试", value: 310 }, { name: "录取", value: 220 },
			] }],
		} },
		{ id: "tree", title: "选修课选课", kind: "矩形树", option: {
			tooltip: {},
			series: [{ type: "treemap", roam: false, nodeClick: false, data: [
				{ name: "理工", value: 180, children: [{ name: "信息", value: 90 }, { name: "实验", value: 90 }] },
				{ name: "人文", value: 140, children: [{ name: "写作", value: 70 }, { name: "史地", value: 70 }] },
				{ name: "艺术", value: 96, children: [{ name: "合唱", value: 50 }, { name: "美术", value: 46 }] },
			] }],
		} },
		{ id: "sun", title: "社团分层", kind: "旭日", option: {
			series: [{ type: "sunburst", radius: [0, "88%"], data: [
				{ name: "体艺", children: [{ name: "篮球", value: 42 }, { name: "合唱", value: 36 }] },
				{ name: "科技", children: [{ name: "机器人", value: 28 }, { name: "航模", value: 18 }] },
				{ name: "志愿", children: [{ name: "讲解", value: 22 }, { name: "环保", value: 16 }] },
			] }],
		} },
		{ id: "rose", title: "学科竞赛人次", kind: "南丁格尔", option: {
			series: [{ type: "pie", roseType: "area", radius: [16, "70%"], data: [
				{ name: "数学", value: 40 }, { name: "物理", value: 32 }, { name: "信息", value: 28 },
				{ name: "英语", value: 24 }, { name: "化学", value: 18 }, { name: "生物", value: 14 },
			] }],
		} },
		{ id: "box", title: "各班均分分布", kind: "箱线", wide: true, option: {
			tooltip: {},
			xAxis: { type: "category", data: ["高一1", "高一2", "高一3", "高一4", "高一5"] },
			yAxis: { type: "value", min: 50, max: 100 },
			series: [{ type: "boxplot", data: [
				[62, 71, 78, 86, 94], [58, 69, 76, 84, 93], [64, 73, 80, 87, 95],
				[60, 70, 77, 85, 92], [63, 72, 79, 88, 96],
			] }],
		} },
		{ id: "k", title: "周测分数带", kind: "K线", option: {
			xAxis: { type: "category", data: weeks() },
			yAxis: { min: 60, max: 100 },
			series: [{ type: "candlestick", data: [
				[72, 81, 70, 84], [74, 79, 71, 83], [76, 82, 73, 86], [71, 78, 68, 82],
				[75, 84, 73, 88], [77, 83, 74, 87], [73, 80, 70, 85], [76, 85, 74, 89],
			] }],
		} },
		{ id: "sankey", title: "毕业去向", kind: "桑基", wide: true, option: {
			series: [{ type: "sankey", emphasis: { focus: "adjacency" }, data: [
				{ name: "高三" }, { name: "本科" }, { name: "高职" }, { name: "就业" }, { name: "本地" }, { name: "外地" },
			], links: [
				{ source: "高三", target: "本科", value: 210 },
				{ source: "高三", target: "高职", value: 86 },
				{ source: "高三", target: "就业", value: 28 },
				{ source: "本科", target: "本地", value: 120 },
				{ source: "本科", target: "外地", value: 90 },
				{ source: "高职", target: "本地", value: 70 },
			] }],
		} },
		{ id: "river", title: "年级活动热度", kind: "主题河流", full: true, option: {
			tooltip: { trigger: "axis" },
			singleAxis: { type: "category", data: weeks() },
			series: [{ type: "themeRiver", data: [
				...weeks().map((w, i) => [w, 20 + i * 2, "初中"]),
				...weeks().map((w, i) => [w, 16 + (8 - i), "高中"]),
				...weeks().map((w, i) => [w, 8 + (i % 3), "社团"]),
			] }],
		} },
		{ id: "parallel", title: "学业多维", kind: "平行坐标", wide: true, option: {
			parallelAxis: [
				{ dim: 0, name: "语文" }, { dim: 1, name: "数学" }, { dim: 2, name: "英语" },
				{ dim: 3, name: "综合" }, { dim: 4, name: "体育" },
			],
			series: [{ type: "parallel", lineStyle: { width: 1.4 }, data: [
				[86, 92, 81, 78, 74], [79, 84, 88, 80, 82], [91, 76, 83, 85, 70],
				[74, 88, 79, 77, 86], [83, 81, 90, 84, 75],
			] }],
		} },
		{ id: "graph", title: "教研协作", kind: "关系图", option: {
			series: [{ type: "graph", layout: "force", roam: false, label: { show: true },
				force: { repulsion: 180 },
				data: [
					{ name: "语文", symbolSize: 36 }, { name: "数学", symbolSize: 34 },
					{ name: "英语", symbolSize: 30 }, { name: "信息", symbolSize: 28 }, { name: "德育", symbolSize: 26 },
				],
				links: [
					{ source: "语文", target: "英语" }, { source: "数学", target: "信息" },
					{ source: "德育", target: "语文" }, { source: "英语", target: "信息" },
				] }],
		} },
		{ id: "pict", title: "机房台账（示意）", kind: "象形柱", option: {
			xAxis: { type: "category", data: ["服务器", "交换", "防火墙"] },
			yAxis: { type: "value", max: 6 },
			series: [{ type: "pictorialBar", symbol: "rect", symbolRepeat: true, symbolSize: [18, 10],
				data: [3, 1, 1] }],
		} },
		{ id: "stack", title: "借书与归还", kind: "堆叠柱", option: {
			tooltip: { trigger: "axis" },
			legend: { data: ["借出", "归还"] },
			xAxis: { type: "category", data: ["3月", "4月", "5月", "6月"] },
			yAxis: { type: "value" },
			series: [
				{ name: "借出", type: "bar", stack: "lib", data: [210, 240, 198, 226] },
				{ name: "归还", type: "bar", stack: "lib", data: [180, 220, 190, 210] },
			],
		} },
	]
}

export function mountCharts(echarts) {
	echarts.registerTheme("paper", paperTheme())
	const nodes = document.querySelectorAll("[data-chart]")
	const charts = []
	for (const node of nodes) {
		const spec = chartSpecs().find((item) => item.id === node.getAttribute("data-chart"))
		if (!spec) continue
		const chart = echarts.init(node, "paper", { renderer: "canvas" })
		chart.setOption(spec.option)
		charts.push(chart)
	}
	window.addEventListener("resize", () => { for (const chart of charts) chart.resize() })
	return charts
}
