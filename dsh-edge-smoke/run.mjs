import { chromium } from "playwright-core"
import { mkdir } from "node:fs/promises"

const shotDir = "D:/dsh-workbench/logs"
await mkdir(shotDir, { recursive: true })

const browser = await chromium.launch({
	channel: "msedge",
	headless: false,
	args: ["--start-maximized"],
})
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
const report = []

try {
	await page.goto("http://127.0.0.1:3080/plugins/dsh-docs/inbox", { waitUntil: "domcontentloaded", timeout: 20000 })
	report.push(`inbox title=${await page.title()}`)
	await page.setInputFiles("#file", "D:/dsh-workbench/docs/_smoke.txt")
	await page.waitForTimeout(2500)
	const inboxText = await page.locator("body").innerText()
	report.push(`inbox hasSmoke=${inboxText.includes("_smoke")}`)
	report.push(`inbox noError=${!inboxText.includes("没有收到文件")}`)
	await page.screenshot({ path: `${shotDir}/edge-inbox.png`, fullPage: true })

	await page.goto("http://127.0.0.1:3080/plugins/dsh-datacenter/board", { waitUntil: "domcontentloaded", timeout: 20000 })
	report.push(`board title=${await page.title()}`)
	await page.click("#t-checkin")
	await page.waitForTimeout(1500)
	const boardText = await page.locator("body").innerText()
	report.push(`board hasCheckin=${/打卡|checkin|08:|2026/.test(boardText)}`)
	await page.screenshot({ path: `${shotDir}/edge-board.png`, fullPage: true })
} finally {
	await browser.close()
}

console.log(report.join("\n"))
