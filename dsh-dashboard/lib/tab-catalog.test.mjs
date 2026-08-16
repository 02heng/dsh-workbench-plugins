import { mergeCatalog, loadCatalog, saveCatalog, CATALOG_STORE } from "./tab-catalog.js"

function fail(msg, extra) {
	console.error("FAIL", msg, extra ?? "")
	process.exit(1)
}

const conversation = [
	{ name: "对话", on: true },
	{ name: "轨迹", on: false },
	{ name: "信使", on: false },
]

const kept = mergeCatalog(conversation, [])
if (kept.length !== 3 || kept[0].name !== "对话" || kept[2].name !== "信使") {
	fail("empty next must keep last conversation catalog", kept)
}

const hijack = mergeCatalog(conversation, [
	{ name: "指南", on: true },
	{ name: "项目日志", on: false },
])
if (hijack.length !== 3 || hijack.some((row) => row.name === "项目日志")) {
	fail("non-conversation tablist must not replace catalog", hijack)
}

const grown = mergeCatalog(conversation, [
	{ name: "对话", on: false },
	{ name: "轨迹", on: false },
	{ name: "信使", on: true },
	{ name: "知识库", on: false },
])
if (grown.map((row) => row.name).join(",") !== "对话,轨迹,信使,知识库" || !grown[2].on) {
	fail("conversation catalog should accept new tabs", grown)
}

const storage = new Map()
const fake = {
	getItem: (key) => storage.get(key) ?? null,
	setItem: (key, value) => storage.set(key, value),
}
saveCatalog(grown, fake)
if (!storage.get(CATALOG_STORE)?.includes("知识库")) fail("save catalog")
const loaded = loadCatalog(fake)
if (loaded.map((row) => row.name).join(",") !== "对话,轨迹,信使,知识库") {
	fail("load catalog", loaded)
}

console.log("PASS tab-catalog")
