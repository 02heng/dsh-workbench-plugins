const { createElement: h, useState, useRef } = window.React

export function useToast() {
	const [toast, setToast] = useState({ text: "", bad: false, show: false })
	const timer = useRef(0)
	const say = (text, ok = true) => {
		setToast({ text, bad: !ok, show: true })
		clearTimeout(timer.current)
		timer.current = setTimeout(() => setToast((cur) => ({ ...cur, show: false })), 2600)
	}
	const node = h("div", {
		className: `toast${toast.show ? " show" : ""}${toast.bad ? " bad" : ""}`,
		role: "status",
	}, toast.text)
	return { say, node }
}

export function useArmed(ms = 3000) {
	const [armed, setArmed] = useState("")
	const timer = useRef(0)
	const arm = (id) => {
		if (armed === id) {
			clearTimeout(timer.current)
			setArmed("")
			return true
		}
		setArmed(id)
		clearTimeout(timer.current)
		timer.current = setTimeout(() => setArmed(""), ms)
		return false
	}
	return { armed, arm }
}

export async function postJson(url, body) {
	const res = await fetch(url, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body ?? {}),
	})
	const data = await res.json()
	if (data.error) throw new Error(data.error)
	return data
}

export function Chip({ children }) {
	return h("span", { className: "chip" }, children)
}
