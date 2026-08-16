import { startSidecarWhenReady } from "./sidecar.js"

function deferred() {
	let resolve
	const promise = new Promise((ok) => { resolve = ok })
	return { promise, resolve }
}

const hold = deferred()
const store = { loadConfig: () => hold.promise }
const sidecar = {
	starts: 0,
	start() { this.starts += 1; return { ok: true } },
}

const auto = startSidecarWhenReady(store, sidecar)
auto.dispose()
hold.resolve({ listen: true })
await auto.done

if (sidecar.starts !== 0) {
	console.error("FAIL dispose race started sidecar", sidecar.starts)
	process.exit(1)
}

const live = deferred()
const liveSidecar = { starts: 0, start() { this.starts += 1; return { ok: true } } }
const liveAuto = startSidecarWhenReady({ loadConfig: () => live.promise }, liveSidecar)
live.resolve({ listen: true })
await liveAuto.done
if (liveSidecar.starts !== 1) {
	console.error("FAIL should start when not disposed", liveSidecar.starts)
	process.exit(1)
}

const off = deferred()
const offSidecar = { starts: 0, start() { this.starts += 1 } }
const offAuto = startSidecarWhenReady({ loadConfig: () => off.promise }, offSidecar)
off.resolve({ listen: false })
await offAuto.done
if (offSidecar.starts !== 0) {
	console.error("FAIL listen false started sidecar")
	process.exit(1)
}

console.log("PASS dispose-race")
