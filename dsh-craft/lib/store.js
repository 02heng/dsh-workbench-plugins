import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { addGoal, completeGoal, openGoals } from "./goals.js"
import { gateAction, modeForChannel, normalizeExpert, normalizeMode, promptFor } from "./mode.js"
import { pickOption, recordOptions } from "./options.js"
import { applySelection, excerpt, pendingPatch } from "./patch.js"
import { reviewPayload } from "./review.js"
import { searchCorpus } from "./search.js"
import { attachFiles, taskCard } from "./tasks.js"

const EMPTY = {
	mode: "craft",
	expert: "none",
	planConfirmed: false,
	options: null,
	goals: [],
	pendingPatch: null,
	reviews: [],
	tasks: [],
}

function onD(path) {
	if (!/^[dD]:[\\/]/.test(String(path ?? ""))) throw new Error("只写 D 盘")
	return String(path)
}

export function createCraftStore(root = "D:/dsh-workbench/craft") {
	onD(root)
	const file = join(root, "state.json")

	async function ensure() {
		await mkdir(root, { recursive: true })
	}

	async function load() {
		await ensure()
		try {
			return { ...EMPTY, ...JSON.parse(await readFile(file, "utf8")) }
		} catch {
			return { ...EMPTY, goals: [], reviews: [], tasks: [] }
		}
	}

	async function save(state) {
		await ensure()
		await writeFile(file, JSON.stringify(state, null, 2), "utf8")
		return state
	}

	async function snapshot() {
		const state = await load()
		return {
			...state,
			openGoals: openGoals(state.goals),
			prompt: promptFor(state),
		}
	}

	async function setMode(mode, { channel } = {}) {
		const state = await load()
		const forced = modeForChannel(channel)
		state.mode = normalizeMode(forced ?? mode)
		if (state.mode !== "plan") state.planConfirmed = state.mode === "craft"
		if (state.mode === "plan") state.planConfirmed = false
		return save(state)
	}

	async function setExpert(expert) {
		const state = await load()
		state.expert = normalizeExpert(expert)
		return save(state)
	}

	async function confirmPlan() {
		const state = await load()
		if (state.mode !== "plan") throw new Error("当前不是想一想")
		if (!state.options || state.options.picked == null) throw new Error("先点一个做法")
		state.planConfirmed = true
		return save(state)
	}

	async function putOptions(brief, options) {
		const state = await load()
		state.options = recordOptions(brief, options)
		state.planConfirmed = false
		if (state.mode === "craft") state.mode = "plan"
		return save(state)
	}

	async function chooseOption(index) {
		const state = await load()
		if (!state.options) throw new Error("还没有做法")
		state.options = pickOption(state.options, index)
		state.planConfirmed = true
		return save(state)
	}

	async function add(title) {
		const state = await load()
		state.goals = addGoal(state.goals, title)
		return save(state)
	}

	async function done(id) {
		const state = await load()
		state.goals = completeGoal(state.goals, id)
		return save(state)
	}

	async function queuePatch(input) {
		const state = await load()
		state.pendingPatch = pendingPatch(input)
		return save(state)
	}

	async function applyPatch(replacement) {
		const state = await load()
		gateAction(state.mode, "write", { planConfirmed: state.planConfirmed })
		const pending = state.pendingPatch
		if (!pending) throw new Error("没有待改选区")
		const text = await readFile(pending.path, "utf8")
		if (excerpt(text, pending.start, pending.end) !== pending.excerpt) {
			throw new Error("文稿已变，请重新圈选")
		}
		const next = applySelection(text, pending.start, pending.end, replacement)
		await writeFile(pending.path, next, "utf8")
		state.pendingPatch = null
		return save(state)
	}

	async function addReview(path, notes) {
		const state = await load()
		state.reviews = [reviewPayload(path, notes), ...state.reviews].slice(0, 20)
		return save(state)
	}

	async function bindFiles(taskId, files) {
		const state = await load()
		const idx = state.tasks.findIndex((row) => row.id === taskId)
		if (idx < 0) {
			state.tasks.unshift(attachFiles({ id: taskId, files: [] }, files))
		} else {
			state.tasks[idx] = attachFiles(state.tasks[idx], files)
		}
		return save(state)
	}

	return {
		root,
		load,
		snapshot,
		setMode,
		setExpert,
		confirmPlan,
		putOptions,
		chooseOption,
		add,
		done,
		queuePatch,
		applyPatch,
		addReview,
		bindFiles,
	}
}

export async function walkMarkdown(roots) {
	const docs = []
	async function walk(dir, depth) {
		if (depth > 6) return
		let entries
		try { entries = await readdir(dir, { withFileTypes: true }) } catch { return }
		for (const ent of entries) {
			if (ent.name.startsWith(".")) continue
			const full = join(dir, ent.name)
			if (ent.isDirectory()) {
				await walk(full, depth + 1)
				continue
			}
			if (!ent.isFile() || !ent.name.toLowerCase().endsWith(".md")) continue
			try {
				const info = await stat(full)
				const body = await readFile(full, "utf8")
				docs.push({
					path: full,
					title: ent.name.replace(/\.md$/i, ""),
					body,
					mtime: info.mtimeMs,
				})
			} catch { /* skip */ }
		}
	}
	for (const root of roots ?? []) await walk(root, 0)
	return docs
}

export async function searchRoots(roots, query, limit, now) {
	return searchCorpus(await walkMarkdown(roots), query, limit, now)
}

export function mergeTaskCards(messengerItems, craftTasks) {
	const extra = new Map((craftTasks ?? []).map((row) => [row.id, row]))
	return (messengerItems ?? []).map((item) => {
		const bound = extra.get(item.id)
		return taskCard(bound ? attachFiles(item, bound.files) : item)
	})
}
