import { mkdir, writeFile } from "node:fs/promises"
import { flattenOptions } from "./bridge.js"

function cordisCtx(attachments) {
	return new Proxy({}, {
		get(_target, prop) {
			if (prop === "get") {
				return (name) => (name === "attachments" ? attachments : undefined)
			}
			throw new Error(`cannot get property "${String(prop)}" without inject`)
		},
	})
}

const scratch = "D:/dsh-workbench/vision-scratch"
await mkdir(scratch, { recursive: true })

const png = Buffer.from(
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
	"base64",
)
const attachments = {
	async readImage() {
		return { ref: { name: "dot.png", mediaType: "image/png" }, data: png }
	},
}

const options = {
	messages: [{
		role: "user",
		content: [
			{ type: "text", text: "你看得到图片吗" },
			{ type: "image", attachment: { attachmentId: "att_test" } },
		],
	}],
}

let threw = ""
let next
try {
	next = await flattenOptions(options, cordisCtx(attachments), { scratch })
} catch (error) {
	threw = String(error?.message ?? error)
}

if (threw.includes("without inject")) {
	console.error("FAIL attachments inject:", threw)
	process.exit(1)
}
if (!next?.messages?.[0]?.content?.every((block) => block.type !== "image")) {
	console.error("FAIL image block still present", JSON.stringify(next, null, 2))
	process.exit(1)
}
const text = next.messages[0].content.map((block) => block.text).join("\n")
if (!/附图/.test(text)) {
	console.error("FAIL no 附图 text", text)
	process.exit(1)
}
await writeFile("D:/dsh-workbench/logs/vision-bridge-test.txt", text, "utf8")
console.log("PASS vision bridge")
