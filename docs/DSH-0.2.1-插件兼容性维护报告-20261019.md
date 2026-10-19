# DSH 0.2.1 兼容性维护报告（自研插件）

- 报告日期：2026-10-19
- 本地运行版本：**0.2.0-rc.2**（桌面版，安装于 `D:\deepseek harness`）
- GitHub 最新版本：**dsh-v0.2.1-rc.2**（2026-10-17T08:16:33Z 发布）
- 本轮范围：**只体检 + 加固，未下载、未更新 DSH**（按要求）
- 涉及插件：`D:\dsh-plugins` 下 12 个自研插件（craft / cursor-delegate / cursor-llm / dashboard / datacenter / edu-kb / messenger / office / themes-ui / vision / work-ui / mcp-server-memory）

---

## 一、结论摘要（先看这里）

| 问题 | 判定 | 处置 |
| --- | --- | --- |
| 0.2.1 的 13 条变更会不会打断我们 | **不会**（逐条核对见第四节） | 无需改代码适配 |
| 我们的插件能否过 DSH 兼容门禁 | **12 个全部通过** | 无需豁免 |
| 换版本后工作台 UI 会不会悄悄消失 | **原代码会静默 no-op（已修）** | 补丁 A：双键探测 + 缺服务告警 |
| 换安装盘/换版本后 cursor-llm 会不会断 | **原代码写死 app.asar 绝对路径（已修）** | 补丁 B：多候选路径推导 |
| 被门禁点名的插件 | 是 **4 个第三方**（非我们），见第三节 | 建议单独处理 |
| 最大的长期风险 | 运行时副本 `D:\dsh-plugins` **无版本控制**，git 快照落后约两个月 | 建议（未执行） |

一句话：**当前 0.2.0-rc.2 能正常跑；升到 0.2.1 后我们的插件仍有极大概率正常，而且这次已经把它最可能"无声坏掉"的两处补上了。**

---

## 二、版本情报（GitHub 实查）

| 版本 | 发布时间 | 要点 |
| --- | --- | --- |
| dsh-v0.2.0-rc.2 | 当前本地版本 | 基线 |
| dsh-v0.2.1-alpha.1 … alpha.5 | 2026-10-17 前 | 预发布序列 |
| dsh-v0.2.1-rc.1 | 2026-10-17T05:22:10Z | **真正的行为变更都在这里**（13 条，见第四节） |
| **dsh-v0.2.1-rc.2** | **2026-10-17T08:16:33Z** | 最新；只 2 条：适配 DeepSeek-V4.1-Flash-1017；适配 DeepSeek Search 与 Fetch API（网页搜索设置可开启） |

> 查法：`https://api.github.com/repos/deepseek-ai/deepseek-harness/releases/tags/<tag>`。注意 `/releases/latest` 返回空（全是 prerelease）；`/releases?per_page=15` 体积大，用网页抓取会被截断导致 JSON 解析失败，逐 tag 取才稳。
> 升级通道：`resources/app-update.yml` 指向 `https://download.deepseek.com/dsh-desk/feeds/win-x64/`，channel = **nightly**。

---

## 三、兼容门禁：DSH 到底怎么判插件能不能用

0.2.0-rc.2 的实现（实读源码 `app.asar/dsh/node_modules/@deepseek-ai/dsh-app-boot/lib/index.js:252-323`）：

1. manifest 没有 `peerDependencies` 字段 → 直接放行。
2. 只检查键名等于 `@deepseek-ai/dsh` 或以 `@deepseek-ai/dsh-` 开头的 peer；**其他键（如 `@deepseek-ai/schemastery`、`cordis`）一律忽略**。
3. range 写成 `workspace:^` / `workspace:~` / `workspace:*` 视为当前运行时版本（必过）；其余用 `semver.satisfies(runtimeVersion, range, { includePrerelease: true })` 判定。
4. 不满足即告警（:320-323）：`Plugin X@V is incompatible with dsh RUNTIME: peerDependencies {...}. Running it may cause crashes or data loss...`，并提示用 `dsh plugin allow-version <包@版本> --dsh-version <exact> [--accept-risk]` 申请**精确版本豁免**（存 profile 的 `compatibility.json`）。

**0.2.1 起改规则**：优先看 `engines.dsh`，未声明时沿用上面这套旧规则。

### 实测结果（`dsh plugin --profile web ls`）

被点名的 **4 个全是第三方，且都不是我们写的**：`@nanmicoder/dsh-agent-teams@0.1.18`、`dsh-better-sidebar@0.19.1`、`dsh-plugin-guide@0.1.0`、`dshmarket@1.47.0`。原因：它们把 peer 写成固定版本串（例如 agent-teams 的 `@deepseek-ai/dsh-tools: '0.1.5-rc.1 || 0.1.2-rc.1 || 0.1.2-alpha.5 || 0.1.2-alpha.2'`），自然不满足 0.2.0-rc.2。

### 用 asar 自带 semver 复刻门禁、遍历 `D:\dsh-plugins` 全部包

**全部通过（OK），含我们的 12 个。** 我们的 peer 写法：craft/dashboard/messenger 只有 `@deepseek-ai/schemastery:*`（键名不以 dsh- 开头 → 根本不检查）；datacenter/edu-kb/office/vision 有 `@deepseek-ai/dsh-tools:*`；cursor-delegate `cordis:* / dsh-tools:* / schemastery:*`；cursor-llm `cordis:* / dsh-llm:* / schemastery:*`；themes-ui `cordis:* / dsh-client-store:* / dsh-client-ui-slots:* / schemastery:* / @dshthemes/core、react`。

> **结论**：我们用的是 `*` 通配，不锁版本，所以不管 DSH 怎么升都不触发门禁。**维护红线：以后给自研插件写 peerDependencies 千万不要写死版本号**（正是那 4 个第三方被点名的原因）。

---

## 四、0.2.1-rc.1 的 13 条变更 vs 我们

| # | 变更 | 对我们的影响 |
| --- | --- | --- |
| 1 | 移除运行时 invariant 插件及各包 `./invariant` 导出 | **无**：翻遍 12 个插件，零使用 |
| 2 | 子路径插件不再读独立 package.json，显示文本/图标须经子路径导出 | **无**：我们的 `./client` 只是 exports 映射到 `lib/*.js`，子路径下没有独立 package.json |
| 3 | 版本兼容性优先按 `engines.dsh` 判断，未声明沿用旧规则 | **无**：我们都没声明 `engines.dsh`，继续走旧规则且已实测通过。暂不盲加声明（写错反而被卡） |
| 4 | 输入区统计拆成 activity / usage 两个入口，覆盖旧 stats 整行的插件需改注册 ID | **无**：无任何插件注册 stats 行（唯一命中是 dashboard 前端的 Vue 事件名 `emit("stats")`，与 slot 无关） |
| 5 | 新增扩展位（用户消息、文本与图片展示、新会话页、模型选择器） | **纯增量**，无破坏 |
| 6 | 自动化任务改为 Web 内置能力；提醒工具按模式提供 | **不涉及**：没用旧实验组合包 |
| 7 | 统一子代理执行与完成通知，工具立即返回 child ID；自定义 SDK runtime 需支持 session/wait | **不涉及** |
| 8 | Agent Team 消息改为直接投递目标 Inbox，移除独立 outbox / 自动重试 / 重发去重 | **不涉及**（agent-teams 是第三方插件自己的事） |
| 9 | Python PTC 接入 Session 文件沙箱策略 | **不涉及** |
| 10 | 移除工具展示的 both 混合模式，仅保留 native / ptc | **不涉及** |
| 11 | 移除 agent-instructions 插件逐行 dshHome 配置 | **不涉及** |
| 12 | pi-ai 1.0.2；Azure provider 名统一为 `azure` | **不涉及**（没用 Azure provider） |
| 13 | 新增 working_directory 工具与 SDK 接口；Session 状态记录接口 | **纯增量** |

---

## 五、依赖面核对（我们依赖的服务/事件/插槽在 0.2.0-rc.2 里都存在吗）

扫描范围：`app.asar` 内 1409 个文件 / 约 45MB。

| 依赖 | 出现次数 | 判定 |
| --- | --- | --- |
| `webServer` | 18 个文件（如 `dsh-api-gateway`、`dsh-client-connection`） | ✅ 存在，我们 5 个插件的主依赖 |
| `httpServer` | **0** | ⚠️ 当前版本不存在（0.2.1 内测通道的服务键）；**双键是为防降级/跨通道保留的保险** |
| `settingsScope` | **0** | ⚠️ 与 2026-09-30 那次历史 crash 吻合（themes-ui 曾等待该服务）；此后无新 crash，判为当时版本错配的旧账 |
| `apiProxy` | **0** | ⚠️ **core 不提供这个服务名** → messenger 的会话调度入口（`readApi(ctx)`）在纯净环境下拿不到，需另有人提供 |
| `systemPrompt` | 56 | ✅ |
| `credentials` | 77 | ✅ |
| `attachments` | 53 | ✅ |
| `llm` / `llm/adapters-updated` | 16 | ✅ |
| `session/event` | 81 / `session/disposed` 18 / `agent/request` 12 | ✅ |
| 插槽 `conversation.input.left` / `.right` / `conversation.view` / `conversation.session.header.actions` / `settings.general.item` | 均有核心包先例 | ✅ 全部存在 |
| 客户端 `dsh.client.inject` 声明的包名 | 与 `desktop-runtime.json` 的 287 个 sharedPackages 比对，**全部命中、无缺失** | ✅ |

> ⚠️ 注意 `dsh-api-gateway` 用的是 `ctx.inject(["connection","webServer"])`——**webServer 依赖 connection**。我们直接取 webServer 时，若 connection 未就绪，0.2.1 下仍可能拿不到，这正是本次加"ready 后告警 + internal/service 重试"的原因。

---

## 六、本次改动清单（6 处，已备份、已测试）

### 补丁 A：5 个插件的 webServer/httpServer 双键硬化

文件：`dsh-craft/lib/index.js`、`dsh-dashboard/lib/index.js`、`dsh-datacenter/lib/index.js`、`dsh-office/lib/index.js`、`dsh-messenger/lib/index.js`

**改前**（服务缺失时静默 no-op，UI 全消失却没有任何日志）：

```js
ctx.inject(["webServer"], (webCtx) => {
  webCtx.effect(() => {
    const webServer = webCtx.webServer
    return webServer === undefined ? () => {} : registerX(webServer, ...)
  }, "dsh-xxx.yyy")
})
```

**改后**（惰性探测：先 reflect 再 get；服务迟到也能补挂；ready 后仍没有就告警）：

```js
const WEB_SERVER_KEYS = ["webServer", "httpServer"]
const readWebService = (key) => { try { const s = ctx.reflect?.get?.(key, false); if (s) return s } catch {} try { return ctx.get(key) } catch { return undefined } }
let webSurfaceRegistered = false
const registerWebSurface = () => {
  if (webSurfaceRegistered) return
  const webServer = WEB_SERVER_KEYS.map(readWebService).find((s) => s !== undefined)
  if (!webServer) return
  webSurfaceRegistered = true
  ctx.effect(() => registerX(webServer, ...), "dsh-xxx.yyy")
}
registerWebSurface()
ctx.on("internal/service", (name) => { if (WEB_SERVER_KEYS.includes(name)) registerWebSurface() })
ctx.on("ready", () => {
  registerWebSurface()
  if (!webSurfaceRegistered) ctx.logger?.warn?.("[dsh-xxx] 未找到 webServer/httpServer 服务，工作台 UI 未挂载")
})
```

messenger 额外把整段 `webCtx` 用法改成 `ctx`，`getApi = () => readApi(ctx)`、`getLlm = () => ctx.llm`，并保留 `export const inject = ["llm"]`。

### 补丁 B：`dsh-cursor-llm/lib/adapter.js` 去掉写死的 app.asar 路径

**改前**：`await import("@deepseek-ai/dsh-llm")` 失败就直接 `import(pathToFileURL("D:/deepseek harness/resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-llm/lib/index.js"))` —— **换安装盘、换目录、改版本即断**。

**改后**：`dshLlmCandidates()` 依次推导 `process.resourcesPath` 与 `dirname(process.execPath)/resources` 两个根 × `app.asar` / `app.asar.unpacked` 两个后缀，再去重、兜底旧硬编码路径；全失败抛出**列出所有已试路径**的错误。`loadSdk()`（`@cursor/sdk`）同样改为「裸导入 → 相对 cursor-delegate 推导 → 旧路径兜底」。

### 备份与验证

- 备份：`D:\dsh-workbench\backups\plugin-compat-20261019\`（6 个文件，改前原样）
- 语法：6 个文件 `node --check` 全部 exit 0
- 单测：craft 11/11、dashboard 5/5、office 2/2、messenger 21/21、datacenter board 通过、cursor-llm 4/5
- **cursor-llm 第 5 个失败是既有问题**：把补丁前的备份文件放回去跑同一用例，**同样**报 `ERR_MODULE_NOT_FOUND ... app.asar/dsh/node_modules/@deepseek-ai/dsh-llm/lib/index.js` —— 普通 node 读不了 asar，该用例只有在 DSH 运行时里才能过。补丁后错误信息反而更明确，属改善。
- 行为验证（隔离探针，未启动第二个 DSH、未动生产目录）：`D:\dsh-workbench\tmp\probe-webkey\` 用 stub loader 替换 `@deepseek-ai/*` 依赖，造 fake ctx 跑 4 种场景 × 5 个插件：
  - 有 `webServer` → 注册成功（craft 16 条路由、dashboard 33 条、messenger 全量路由）
  - 只有 `httpServer` → **同样注册成功**（双键生效）
  - 两个都没有 → 注册 0 条 + **1 条 warn**（不再静默）
  - 先没有、随后发 `internal/service("webServer")` → **迟绑定成功**

---

## 七、遗留风险与建议（尚未处理）

1. **`D:\dsh-plugins`（运行时真正加载的目录）没有版本控制**，12 个自研插件里只有 messenger 有 `.git`。同时 `D:\dsh-workbench-plugins`（git 仓库，单提交 61b15c3）与运行时代码**字节相同但落后约两个月**。→ **建议**：把当前运行时版本正式提交一份到 git（可作为改动前快照），以后每次改插件先提交再改。
2. **`apiProxy` 服务在 core 中不存在**：messenger 的会话派发（新建会话/选模型/发 prompt）依赖它，纯净环境取不到 → 建议确认这是否由某个第三方插件/旧版本提供，否则功能属"看运气"。对应代码有 `typeof api.sessions.selectModel !== "function"` 兜底，不会崩。
3. **`settingsScope` 在 0.2.0-rc.2 不存在**：历史上已导致过 themes-ui 启动等待失败（2026-09-30 两次 crash）。当前代码 inject 已不含它，若将来再出现同类 crash，第一嫌疑仍是客户端插件等待了 0.2.0-rc.2 不提供的服务。
4. **`engines.dsh` 建议暂不声明**：0.2.1 会优先读它，写错范围等于自己把自己卡在门外；等确认 0.2.1 稳定、且弄清该字段的取值规范后再加。
5. **更新 DSH 之后的复检清单**（照做即可确认没坏）：
   - `dsh plugin --profile web ls` → 看有没有被告警点名的插件
   - 重启后看日志有没有我们新加的 `[dsh-xxx] 未找到 webServer/httpServer 服务，工作台 UI 未挂载` 告警
   - 打开工作台各页（craft 台面 / dashboard 墙 / 数据中心 / 收件箱 / 微信面板）确认 UI 在
   - 跑一遍 `node --test` 那 6 个测试文件
   - 重新执行本报告第八节的"门禁模拟"脚本

---

## 八、复检命令清单

```powershell
# 1) 以 Electron 当 Node 用，读 app.asar 里的任何东西
$env:ELECTRON_RUN_AS_NODE="1"
& "D:\deepseek harness\DeepSeek Harness.exe" D:\dsh-workbench\tmp\asar-probe.cjs

# 2) 官方 CLI（版本、插件清单、兼容门禁告警）
& "D:/deepseek harness/resources/runtime/cli/bin/dsh.cmd" --version
& "D:/deepseek harness/resources/runtime/cli/bin/dsh.cmd" plugin --profile web ls

# 3) 跑插件自带单测（必须传显式文件列表，传目录会伪失败）
$node = "D:\deepseek harness\resources\runtime\primary-runtime\dependencies\node\bin\node.exe"
foreach ($p in "dsh-craft","dsh-dashboard","dsh-datacenter","dsh-office","dsh-messenger","dsh-cursor-llm") {
  $files = Get-ChildItem "D:/dsh-plugins/$p/lib/*.test.mjs" | ForEach-Object { $_.FullName }
  if ($files) { & $node --test @files; "== $p exit=$LASTEXITCODE" }
}

# 4) 行为探针（验证双键注册）
& $node D:\dsh-workbench\tmp\probe-webkey\probe.mjs
```

---

## 九、附录：两个关键技术手法（以后可复用）

1. **读 `app.asar` 内部文件**：把 Electron 主程序当 Node 用 —— `$env:ELECTRON_RUN_AS_NODE="1"; & "D:\deepseek harness\DeepSeek Harness.exe" <script.cjs>`。用普通 fs / read 工具会分别报 `ENOENT, not found in ...app.asar` 和 `Cannot mix BigInt and other types`。asar 自带 semver 可直接 `require('D:/deepseek harness/resources/app.asar/dsh/node_modules/semver')`。
2. **带 asar 路径的模块测试**：普通 Node 无法 `import` asar 内路径，凡是指向 asar 的用例必然 `ERR_MODULE_NOT_FOUND`；要么在 DSH 运行时里跑，要么用本报告的 stub loader 方案（`module.register('./loader.mjs', import.meta.url)` 把裸包名映射到假模块），注意脚本末尾 `process.exit(0)`，否则 loader 线程会让进程不退出。

---

*报告生成：DSH 会话 session-6fe00033-bcaf-4e9a-bdf0-d99363595dcd · 未对 DSH 本体做任何下载或更新*
