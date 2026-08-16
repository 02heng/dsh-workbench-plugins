import { parseHash } from "./router.js"
import { DeskPage } from "./pages/desk.js"
import { InboxPage } from "./pages/inbox.js"
import { BoardPage } from "./pages/board.js"
import { WallPage } from "./pages/wall.js"
import { AtelierPage } from "./pages/atelier.js"

const { createElement: h, useEffect, useState } = window.React
const { createRoot } = window.ReactDOM

function KeepAlive({ active, children }) {
	const [seen, setSeen] = useState(active)
	useEffect(() => {
		if (active) setSeen(true)
	}, [active])
	if (!seen) return null
	return h("div", { className: active ? "page is-on" : "page is-off", hidden: !active }, children)
}

function App() {
	const [route, setRoute] = useState(() => parseHash(location.hash || "#/desk"))
	useEffect(() => {
		const sync = () => setRoute(parseHash(location.hash || "#/desk"))
		window.addEventListener("hashchange", sync)
		return () => window.removeEventListener("hashchange", sync)
	}, [])
	const name = route.name
	const page = route.page
	return h("div", { className: "work-root" },
		h(KeepAlive, { active: name === "desk" }, h(DeskPage, { active: name === "desk" })),
		h(KeepAlive, { active: name === "inbox" }, h(InboxPage, { active: name === "inbox" })),
		h(KeepAlive, { active: name === "board" }, h(BoardPage, { active: name === "board" })),
		h(KeepAlive, { active: name === "wall" }, h(WallPage, { active: name === "wall" })),
		h(KeepAlive, { active: name === "atelier" && page === "book" }, h(AtelierPage, { page: "book", active: name === "atelier" && page === "book" })),
		h(KeepAlive, { active: name === "atelier" && page === "trail" }, h(AtelierPage, { page: "trail", active: name === "atelier" && page === "trail" })),
		h(KeepAlive, { active: name === "atelier" && page === "memory" }, h(AtelierPage, { page: "memory", active: name === "atelier" && page === "memory" })),
		h(KeepAlive, { active: name === "atelier" && page === "skills" }, h(AtelierPage, { page: "skills", active: name === "atelier" && page === "skills" })),
		h(KeepAlive, { active: name === "atelier" && page === "todos" }, h(AtelierPage, { page: "todos", active: name === "atelier" && page === "todos" })),
	)
}

const root = document.getElementById("app")
if (root) createRoot(root).render(h(App))
