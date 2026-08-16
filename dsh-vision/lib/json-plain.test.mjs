import { toToolValue } from "./json-plain.js"

const raw = {
	path: "D:/dsh-workbench/vision-scratch/a.png",
	kind: "image",
	engine: "ocr+cursor",
	ocrChars: 12,
	text: "【本地 OCR】\n你好",
	truncated: false,
	note: undefined,
}

let threw = false
try {
	JSON.parse(JSON.stringify(raw))
	if (Object.values(raw).includes(undefined)) threw = true
} catch {
	threw = true
}

const plain = toToolValue(raw)
if (Object.values(plain).includes(undefined) || "note" in plain) {
	console.error("FAIL still has undefined/note", plain)
	process.exit(1)
}
if (plain.text !== raw.text || plain.path !== raw.path) {
	console.error("FAIL lost fields", plain)
	process.exit(1)
}
if (!threw) {
	console.log("note: raw object still carries undefined (as expected before sanitize)")
}
console.log("PASS json-plain")
