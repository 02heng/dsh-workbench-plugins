import { parseInbound } from "./password.js"

function eq(a, b, msg) {
	if (JSON.stringify(a) !== JSON.stringify(b)) {
		console.error("FAIL", msg, a, b)
		process.exit(1)
	}
}

eq(parseInbound("你好"), { action: "record", prompt: "你好", passwordId: "" }, "plain")
eq(parseInbound("  任务: 写一句今日值班备忘"), { action: "dispatch", prompt: "写一句今日值班备忘", passwordId: "pw-1" }, "half")
eq(parseInbound("任务：清点本周循环任务"), { action: "dispatch", prompt: "清点本周循环任务", passwordId: "pw-1" }, "full")
eq(parseInbound("任务:"), { action: "empty-password", prompt: "", passwordId: "pw-1" }, "empty")
eq(parseInbound("任务：   "), { action: "empty-password", prompt: "", passwordId: "pw-1" }, "empty-full")
eq(parseInbound("图", "image"), { action: "ignore", prompt: "", passwordId: "" }, "image")
eq(parseInbound("", "file"), { action: "ignore", prompt: "", passwordId: "" }, "file")
eq(parseInbound("任务清单"), { action: "record", prompt: "任务清单", passwordId: "" }, "bare 任务 is chat")
eq(
	parseInbound("补齐 学制表", "text", [{ id: "pw-2", token: "补齐", prompt: "请补齐：{{input}}" }]),
	{ action: "dispatch", prompt: "请补齐：学制表", passwordId: "pw-2" },
	"custom token",
)
console.log("PASS password")
