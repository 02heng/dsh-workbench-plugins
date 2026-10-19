import { readdir, stat } from "node:fs/promises"
import { extname, join } from "node:path"

const SKIP = new Set(["messenger", ".dsh", "node_modules", ".git", "wx-cache"])
const EXTS = new Set([".docx", ".xlsx", ".pptx", ".pdf"])

export function workRoot() {
	return process.env.DSH_WORK_ROOT ?? "D:/dsh-workbench"
}

export async function listDeliverables(root, sinceMs) {
	const since = Number(sinceMs) || 0
	const out = []

	async function walk(dir, depth) {
		if (depth > 6) return
		let entries
		try {
			entries = await readdir(dir, { withFileTypes: true })
		} catch {
			return
		}
		for (const ent of entries) {
			if (ent.name.startsWith(".")) continue
			if (SKIP.has(ent.name)) continue
			const full = join(dir, ent.name)
			if (ent.isDirectory()) {
				await walk(full, depth + 1)
				continue
			}
			if (!ent.isFile()) continue
			if (!EXTS.has(extname(ent.name).toLowerCase())) continue
			try {
				const info = await stat(full)
				if (info.size > 0 && info.mtimeMs >= since) out.push(full)
			} catch {
				/* skip */
			}
		}
	}

	await walk(root, 0)
	return out.sort()
}
