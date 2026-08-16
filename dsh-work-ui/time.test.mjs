import { formatBeijingTime, ledgerDay } from "./time.js"

function fail(msg) {
	console.error("FAIL", msg)
	process.exit(1)
}

if (formatBeijingTime("2026-08-16T04:54:38.000Z") !== "2026-08-16 12:54:38") fail("utc to beijing")
if (formatBeijingTime("2026-08-16T00:10:00+08:00") !== "2026-08-16 00:10:00") fail("already beijing")
if (formatBeijingTime("2026-08-15T12:00:00Z", { seconds: false }) !== "2026-08-15 20:00") fail("no seconds")
if (ledgerDay(new Date("2026-08-16T01:00:00+08:00")) !== "2026-08-16") fail("ledgerDay shanghai")

console.log("PASS time")
