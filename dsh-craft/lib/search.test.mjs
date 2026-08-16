import { scoreDoc, searchCorpus } from "./search.js"

function assert(cond, msg) {
	if (!cond) throw new Error(msg)
}

const docs = [
	{ path: "notes/课题预审.md", title: "课题预审", body: "上周交的预审稿，口径按调研写。", mtime: Date.parse("2026-08-10T00:00:00+08:00") },
	{ path: "notes/值班.md", title: "值班纪要", body: "机房巡检。", mtime: Date.parse("2026-08-16T00:00:00+08:00") },
	{ path: "notes/old.md", title: "旧预审", body: "更早的预审草稿", mtime: Date.parse("2025-01-01T00:00:00+08:00") },
]

const hits = searchCorpus(docs, "上周那份课题预审", 5, Date.parse("2026-08-16T12:00:00+08:00"))
assert(hits[0].path.includes("课题预审"), hits[0].path)
assert(hits[0].snippet.includes("预审"), hits[0].snippet)
assert(scoreDoc(docs[1], "课题预审") < scoreDoc(docs[0], "课题预审"), "title wins")

const empty = searchCorpus(docs, "不存在的词xyz", 5)
assert(empty.length === 0, "no hit")

try { searchCorpus(docs, "  "); throw new Error("blank") } catch (e) {
	if (e.message === "blank") throw e
}

console.log("PASS search")
