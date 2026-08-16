import { watch } from "node:fs"
import { stat } from "node:fs/promises"
import { fileURLToPath } from "node:url"

const SHARED = "D:/dsh-plugins/dsh-work-ui"

export function createLive({ dirs, path, reload = false }) {
	const clients = new Set()
	let timer
	const ping = () => {
		clearTimeout(timer)
		timer = setTimeout(() => {
			for (const res of clients) {
				try { res.write("data: reload\n\n") } catch { clients.delete(res) }
			}
		}, 140)
	}
	const snippet = `<div class="live-dot" id="live-dot"><i></i>Live</div>
<script>
(function(){
  var dot=document.getElementById("live-dot");
  var es=new EventSource(${JSON.stringify(path)});
  es.onopen=function(){ if(dot) dot.classList.remove("off"); };
  es.onerror=function(){ if(dot) dot.classList.add("off"); };
  es.onmessage=function(){ ${reload ? "location.reload();" : "if(dot) dot.classList.remove('off');"} };
})();
</script>`

	return {
		snippet,
		withLive(html) {
			return String(html).includes("</body>")
				? String(html).replace("</body>", `${snippet}</body>`)
				: String(html) + snippet
		},
		register(webServer) {
			const watchers = [...new Set([...dirs, SHARED])].map((dir) => {
				try { return watch(dir, { recursive: true }, ping) } catch { return null }
			}).filter(Boolean)
			const stop = webServer.register({
				kind: "exact",
				path,
				handler: async (req, res) => {
					res.writeHead(200, {
						"content-type": "text/event-stream; charset=utf-8",
						"cache-control": "no-cache, no-transform",
						connection: "keep-alive",
					})
					res.write("retry: 800\n\n")
					clients.add(res)
					req.on("close", () => clients.delete(res))
				},
			})
			return () => {
				stop?.()
				for (const watcher of watchers) watcher.close()
				clients.clear()
			}
		},
	}
}

export async function loadFresh(moduleUrl) {
	const file = fileURLToPath(moduleUrl)
	const stamp = (await stat(file)).mtimeMs
	return import(`${moduleUrl}?t=${stamp}`)
}
