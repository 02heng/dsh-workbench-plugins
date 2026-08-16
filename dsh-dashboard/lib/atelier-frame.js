const RAIL_MIN = 40
const COMPACT_RAIL = 56

let atelierShowGen = 0

export function beginAtelierShow() {
	atelierShowGen += 1
	return atelierShowGen
}

export function cancelAtelierShow() {
	atelierShowGen += 1
	return atelierShowGen
}

export function isAtelierShowCurrent(id) {
	return Number(id) === atelierShowGen
}

export function computeAtelierBox({ view, header, aside, composer, viewport }) {
	const vw = viewport?.width ?? 0
	const vh = viewport?.height ?? 0
	const rail = Math.round(aside?.right ?? 0)
	const safeRail = rail >= RAIL_MIN ? rail : 0
	const headerBottom = Math.round(header?.bottom ?? 88)
	const composerTop = composer && Number(composer.top) > 80 ? Math.round(composer.top) : vh

	let top
	let left
	let right
	if (view && view.width >= 320 && view.height >= 80) {
		top = Math.round(view.top)
		left = Math.round(view.left)
		right = Math.round((view.right != null ? view.right : view.left + view.width))
	} else {
		top = headerBottom
		left = safeRail
		right = vw
	}

	if (safeRail > left) left = safeRail
	if (left < RAIL_MIN && safeRail >= RAIL_MIN) left = safeRail
	if (left < RAIL_MIN && vw >= 800) left = COMPACT_RAIL

	const bottom = Math.min(composerTop, vh)
	return {
		top,
		left,
		width: Math.max(0, Math.round(right - left)),
		height: Math.max(0, Math.round(bottom - top)),
	}
}
