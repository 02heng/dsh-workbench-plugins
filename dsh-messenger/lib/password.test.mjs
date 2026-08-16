import { parseInbound } from "./password.js"

function eq(a, b, msg) {
	if (JSON.stringify(a) !== JSON.stringify(b)) {
		console.error("FAIL", msg, a, b)
		process.exit(1)
	}
}

eq(parseInbound("你好"), { action: "record", prompt: "你好" }, "plain")
eq(parseInbound("  任务: 写一句今日值班备忘"), { action: "dispatch", prompt: "写一句今日值班备忘" }, "half")
eq(parseInbound("任务：清点本周循环任务"), { action: "dispatch", prompt: "清点本周循环任务" }, "full")
eq(parseInbound("任务:"), { action: "empty-password", prompt: "" }, "empty")
eq(parseInbound("任务：   "), { action: "empty-password", prompt: "" }, "empty-full")
eq(parseInbound("图", "image"), { action: "ignore", prompt: "" }, "image")
eq(parseInbound("", "file"), { action: "ignore", prompt: "" }, "file")
console.log("PASS password")
