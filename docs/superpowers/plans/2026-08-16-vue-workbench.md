# 台账前端 Vue 单页 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把卡顿的纸感台账页（信使、知识库、循环任务、书籍/轨迹/记忆/技能/待办、数据大屏）收成一个 Vue 3 单页，页签切换只换路由、不拆 iframe、不整页重载。

**Architecture:** DSH 对话壳、侧栏、输入框仍是 React，**不 fork 核心**。现在每个页签各挂一个 iframe、各拉一份 HTML，所以切「信使 ↔ 记忆」会白屏、转圈、盖层打架。改成只留 **一个** 常驻 iframe（`#dsh-work-frame`），里面跑 Vue Router + `<keep-alive>`；顶栏 `dsh-tab-change` 只改 hash。微信监听继续走侧车，不依赖页面是否打开。旧的 `/desk` `/inbox` `/board` `/atelier` `/wall` HTML 路由先保留作回退，Vue 页只打已有 JSON API。

**Tech Stack:** Vue 3（已有 `D:\dsh-plugins\dsh-dashboard\vendor\vue.esm-browser.js`）、自写 hash router（不引入 Vite/npm 构建，避免再卡一层）、现有 `theme.css` 纸感变量、Node 侧 `*.test.mjs` TDD。

## Global Constraints

- 不改 `D:\deepseek-harness` 核心，不重写「对话」页 React。
- 纸感台账：米色 `#f4efe6`，墨绿 `#0f5c56`，Cormorant / IBM Plex / 思源；危险操作两步确认。
- 微信口令仍是开头 `任务:` / `任务：`；侧车监听不随页签卸载。
- `/desk` 首屏禁止等 IMAP；邮件后补。下载只进 D 盘。
- 密钥不进 git、不打印。未要求时不 `git commit`。
- 列表锁高度 + `paper-scroll`；未选中页不轮询（信使监听除外）。
- 字体用系统已缓存的 theme，禁止再 `@import` Google Fonts 挡首屏。

---

## 为何卡（对照，实现时不要退回去）

1. 每页一个 iframe：切页 = 销毁文档 + 重新解析 HTML + 再连 EventSource。
2. 台账层 `data-atelier` + `visibility:hidden` 和信使抢中间区域；`showAtelier` 异步竞态会把空白层盖回来。
3. `createLive` 的 `location.reload()` 在 Windows `fs.watch` 下会连刷，标签一直转。
4. 信使 `/desk` 曾同步等 QQ IMAP（已 skipInbox，Vue 首屏也必须 skip）。
5. `atelier.js` 已是 Vue，但活在第二层 iframe 里，等于 Vue 外包了一层卡。

## 文件地图

| 路径 | 职责 |
|---|---|
| `D:\dsh-plugins\dsh-work-ui\app.html` | 单页壳，只挂 `#app` |
| `D:\dsh-plugins\dsh-work-ui\router.js` | hash 路由：`#/desk` `#/inbox` `#/board` `#/wall` `#/atelier/:page` |
| `D:\dsh-plugins\dsh-work-ui\tab-bridge.js` | `dsh-tab-change` → route；`信使` 保持 listen |
| `D:\dsh-plugins\dsh-work-ui\mount.js` | `createApp` + keep-alive |
| `D:\dsh-plugins\dsh-work-ui\pages\*.js` | 各页 Vue 组件（Options/组合式均可，与现 `atelier.js` 一致用组合式） |
| `D:\dsh-plugins\dsh-work-ui\theme.css` | 共用纸感；去掉会挡加载的 Google `@import`（改 `link` 或本地） |
| `D:\dsh-plugins\dsh-dashboard\lib\client.js` | 只维护 **一个** work-frame；删 `dsh-atelier-frame` 盖层 |
| `D:\dsh-plugins\dsh-messenger\lib\client.js` 等 | 不再各自 `createElement(iframe)`，改注册空占位或不再占 view |
| 各插件 `lib/http.js` | 增加或确认 JSON API；HTML 路由可暂留 |

页签 → 路由：

```
对话            → 不进 iframe（DSH 自己的 chat）
书籍转技能      → #/atelier/book
轨迹            → #/atelier/trail
记忆            → #/atelier/memory
技能            → #/atelier/skills
待办            → #/atelier/todos
循环任务        → #/board
知识库          → #/inbox
信使            → #/desk
数据大屏        → #/wall
```

---

### Task 1: 路由与页签桥（不画业务页）

**Files:**
- Create: `D:\dsh-plugins\dsh-work-ui\router.js`
- Create: `D:\dsh-plugins\dsh-work-ui\tab-bridge.js`
- Create: `D:\dsh-plugins\dsh-work-ui\router.test.mjs`
- Create: `D:\dsh-plugins\dsh-work-ui\tab-bridge.test.mjs`
- Modify: `D:\dsh-plugins\dsh-work-ui\lazy-tab.js`（复用 `atelierPageOf` / `isLiveListenTab`）

**Interfaces:**
- Produces: `routeFromTab(name) → { name, path }`；`tabFromPath(path) → string`；`parseHash(hash) → { name, page? }`
- Produces: `shouldKeepListen(tabName) → boolean`（仅信使/微信为 true）

- [ ] **Step 1: 写失败测试**

```js
// D:\dsh-plugins\dsh-work-ui\router.test.mjs
import { parseHash, routeFromTab, tabFromPath } from "./router.js"

function fail(msg) { console.error("FAIL", msg); process.exit(1) }
if (routeFromTab("信使").path !== "#/desk") fail("desk")
if (routeFromTab("记忆").path !== "#/atelier/memory") fail("memory")
if (routeFromTab("对话").path !== "") fail("chat stays in host")
if (tabFromPath("#/board") !== "循环任务") fail("board tab")
if (parseHash("#/atelier/trail").page !== "trail") fail("trail page")
console.log("PASS router")
```

```js
// D:\dsh-plugins\dsh-work-ui\tab-bridge.test.mjs
import { shouldKeepListen } from "./tab-bridge.js"
function fail(msg) { console.error("FAIL", msg); process.exit(1) }
if (!shouldKeepListen("信使")) fail("keep wx listen")
if (shouldKeepListen("知识库")) fail("inbox is not live listen")
console.log("PASS tab-bridge")
```

- [ ] **Step 2: 跑测试，确认失败**

```
node D:\dsh-plugins\dsh-work-ui\router.test.mjs
```

Expected: `ERR_MODULE_NOT_FOUND` 或 `FAIL`

- [ ] **Step 3: 最小实现**

`router.js` 用一张表：

```js
export const TAB_ROUTES = [
  { tab: "信使", path: "#/desk", name: "desk" },
  { tab: "知识库", path: "#/inbox", name: "inbox" },
  { tab: "循环任务", path: "#/board", name: "board" },
  { tab: "数据大屏", path: "#/wall", name: "wall" },
  { tab: "书籍转技能", path: "#/atelier/book", name: "atelier", page: "book" },
  { tab: "轨迹", path: "#/atelier/trail", name: "atelier", page: "trail" },
  { tab: "记忆", path: "#/atelier/memory", name: "atelier", page: "memory" },
  { tab: "技能", path: "#/atelier/skills", name: "atelier", page: "skills" },
  { tab: "待办", path: "#/atelier/todos", name: "atelier", page: "todos" },
]
```

`routeFromTab("对话")` 与未登记页签返回 `{ name: "host", path: "" }`。

`tab-bridge.js`：`shouldKeepListen` 转调 `isLiveListenTab`。

- [ ] **Step 4: 再跑测试**

```
node D:\dsh-plugins\dsh-work-ui\router.test.mjs
node D:\dsh-plugins\dsh-work-ui\tab-bridge.test.mjs
```

Expected: `PASS router` / `PASS tab-bridge`

- [ ] **Step 5: 提交（仅当用户要求 commit）**

---

### Task 2: 单 iframe 壳 + 去掉台账盖层

**Files:**
- Create: `D:\dsh-plugins\dsh-work-ui\app.html`
- Create: `D:\dsh-plugins\dsh-work-ui\mount.js`
- Create: `D:\dsh-plugins\dsh-work-ui\http.js`（只服务 `/plugins/dsh-work-ui/app` 与静态 js/css）
- Create: `D:\dsh-plugins\dsh-work-ui\app.test.mjs`
- Modify: `D:\dsh-plugins\dsh-dashboard\lib\client.js`
- Modify: `D:\dsh-plugins\dsh-dashboard\lib\atelier-frame.test.mjs`
- Modify: `D:\dsh-plugins\dsh-dashboard\lib\index.js`（若需挂上 work-ui http）

**Interfaces:**
- Consumes: `routeFromTab` / `parseHash`
- Produces: 宿主只创建一个 iframe，`src` 固定 `/plugins/dsh-work-ui/app`，之后只改 `contentWindow.location.hash`
- Produces: `html` 不再设 `data-atelier`，不再 `visibility:hidden` 中间栏

- [ ] **Step 1: 写失败测试**

`app.test.mjs`：读 `app.html`，必须含 `id="app"`、`type="module"`、`mount.js`，且 **没有** `EventSource` / `location.reload`。

`atelier-frame.test.mjs` 追加：`client.js` 不得再出现 `dsh-atelier-frame` 与 `data-atelier`；必须出现 `dsh-work-frame` 与 `/plugins/dsh-work-ui/app`。

- [ ] **Step 2: 跑测试，确认失败**

```
node D:\dsh-plugins\dsh-work-ui\app.test.mjs
node D:\dsh-plugins\dsh-dashboard\lib\atelier-frame.test.mjs
```

- [ ] **Step 3: 实现壳**

`app.html` 骨架：

```html
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8"/>
  <title>工作台账</title>
  <link rel="stylesheet" href="/plugins/dsh-work-ui/theme.css"/>
</head>
<body class="atelier">
  <div id="app"></div>
  <script type="module" src="/plugins/dsh-work-ui/mount.js"></script>
</body>
</html>
```

`mount.js`：`createApp` + 根据 hash 显示占位页（「台账装订中」），`window.addEventListener("hashchange")`。

`client.js` 的 `showAtelier` / `hideAtelier` 改成：

- 非「对话」且能 `routeFromTab`：确保 `#dsh-work-frame` 存在，`src` 只设一次，然后 `frame.contentWindow.location.hash = route.path`（跨域同 origin `127.0.0.1:3080`）。
- 「对话」：`display:none` 藏 frame，**不要** `about:blank`（避免下次整页重载）。
- 删除 `html[data-atelier] [class*='viewArea']>*{visibility:hidden}`。

定位继续用 `computeAtelierBox`（让开侧栏和输入框）。`z-index` 低于页签栏（40），高于对话区即可（28）。

- [ ] **Step 4: 再跑测试**

Expected: `PASS` / `ok`

- [ ] **Step 5: 手工**  
打开工作台，切「记忆」应看到壳；切「对话」中间回到聊天，再切「记忆」**不应**再转圈加载整份 HTML。

---

### Task 3: 信使页迁入 Vue（先这一页，验证丝滑）

**Files:**
- Create: `D:\dsh-plugins\dsh-work-ui\pages\desk.js`
- Create: `D:\dsh-plugins\dsh-work-ui\pages\desk.test.mjs`（测 `itemsFingerprint` / `formatBeijingTime` 复用）
- Modify: `D:\dsh-plugins\dsh-work-ui\mount.js`
- Modify: `D:\dsh-plugins\dsh-messenger\lib\client.js`（不再挂自己的 iframe）
- Keep: `D:\dsh-plugins\dsh-messenger\lib\http.js` 的 `/state` `/item/delete` 等 JSON

**Interfaces:**
- Consumes: `GET /plugins/dsh-messenger/state`（已 skipInbox 的首屏逻辑在服务端；Vue 进入 desk 再 pull）
- Consumes: `formatBeijingTime` 从 `../dsh-messenger/lib/store.js` 或拷一份到 `dsh-work-ui/time.js`（避免浏览器 import Node `fs`——**必须**把 `formatBeijingTime` / `ledgerDay` 抽到无 Node API 的 `D:\dsh-plugins\dsh-work-ui\time.js`）
- Produces: 台账列表指纹不变不重绘；`visibilityState==='hidden'` 或路由不是 desk 则停 2s 轮询；**不**停侧车 listen

- [ ] **Step 1: 抽 `time.js` + 失败测试**（把现 `store.test.mjs` 里北京时间用例挪/复制过来）

- [ ] **Step 2: 跑失败**

```
node D:\dsh-plugins\dsh-work-ui\time.test.mjs
```

- [ ] **Step 3: 实现 `time.js`，再写 `pages/desk.js`**

交互必须保留：投放区自绘、两步删除、Toast、展开条子、再派/再截。模板从 `desk.js` 的 `slip` 结构搬，样式走 `theme.css` + 少量页内 class。

轮询：

```js
watch(routeName, (name) => {
  if (name === "desk") startPull()
  else stopPull()
})
```

- [ ] **Step 4: `http.desk.test.mjs` 仍过**（JSON API 未改）。另加：`messenger/lib/client.js` 不含 `/plugins/dsh-messenger/desk` iframe src。

- [ ] **Step 5: 手工**  
切到信使应立刻出骨架；列表 2s 刷新不闪。切走信使，Network 里不应再打 `/state`。微信侧车仍收 `任务:`。

---

### Task 4: 知识库 + 循环任务迁入 Vue

**Files:**
- Create: `D:\dsh-plugins\dsh-work-ui\pages\inbox.js`
- Create: `D:\dsh-plugins\dsh-work-ui\pages\board.js`
- Modify: `D:\dsh-plugins\dsh-office\lib\client.js`、`dsh-datacenter\lib\client.js`（去掉独立 iframe）
- Keep: `/plugins/dsh-docs/api/*`、`/plugins/dsh-datacenter/api/*`

**Interfaces:**
- inbox：拖放/选取、解析、入知识库、两步删除；表格 `paper-scroll`
- board：标签/设备/任务/打卡；表和 timeline `paper-scroll`
- 进入路由才 `GET` 列表；离开取消 in-flight（`AbortController`）

- [ ] **Step 1:** `inbox-page.test.mjs` / `board.test.mjs` 改为断言 Vue 页或 API 仍返回原字段；新增 `pages/inbox.test.mjs` 测「未选中不 fetch」可用纯函数 `shouldFetch(route, name)`。

- [ ] **Step 2–4:** TDD 后搬 DOM。危险删除仍先「移除」再「确认删除」，3 秒收回。

- [ ] **Step 5: 手工** 信使 → 知识库 → 循环任务应无白屏、无标签转圈。

---

### Task 5: 把已有 `atelier.js` 收进同一应用（拆页，不再第二层 iframe）

**Files:**
- Modify: `D:\dsh-plugins\dsh-dashboard\lib\atelier.js` → 拆到  
  `D:\dsh-plugins\dsh-work-ui\pages\book.js`  
  `D:\dsh-plugins\dsh-work-ui\pages\trail.js`  
  `D:\dsh-plugins\dsh-work-ui\pages\memory.js`  
  `D:\dsh-plugins\dsh-work-ui\pages\skills.js`  
  `D:\dsh-plugins\dsh-work-ui\pages\todos.js`
- Modify: `mount.js` 用 `<keep-alive>` 包这五页
- Delete usage: `#dsh-atelier-frame`、`/plugins/dsh-dashboard/atelier` 作为主路径（文件可留一周作回退）

**Interfaces:**
- 仍打现有 `/book2skill/*`、`/memory-evolve/api/*`、`/skills-manager/api/*`、session export
- `onMounted` 只在该页第一次激活时请求；`onActivated` / `onDeactivated` 控制刷新按钮以外的自动请求
- 列表继续 `paper-scroll`

- [ ] **Step 1:** `atelier-frame.test.mjs` 已禁止第二 iframe；再加 `mount.js` 含 `keep-alive` 与五个 page 名。

- [ ] **Step 2–4:** 按页搬组件，每搬一页跑一次相关 API 的现有测试（不改契约）。

- [ ] **Step 5: 手工** 记忆 ↔ 待办 ↔ 轨迹应像切卡片，不要整页 Live 重载。

---

### Task 6: 数据大屏进同一应用 + 停掉 Live 整页刷新

**Files:**
- Create: `D:\dsh-plugins\dsh-work-ui\pages\wall.js`
- Modify: `D:\dsh-plugins\dsh-work-ui\live.js`：`withLive` 默认 **不再** 注入 `location.reload()`；改为只更新 `.live-dot`，或仅 `?live=1` 才热重载
- Modify: `D:\dsh-plugins\dsh-dashboard\lib\client.js` 的 DataWallPanel：不要第二 iframe，走 `#/wall`
- Create: `D:\dsh-plugins\dsh-work-ui\live.test.mjs`

**Interfaces:**
- `createLive({ reload: false })` 为默认
- wall 的 `setInterval` 仅在 `route==='wall' && visibilityState==='visible'`

- [ ] **Step 1:** `live.test.mjs`：默认 snippet **不含** `location.reload`；`reload: true` 才含。

- [ ] **Step 2–4:** 改 `createLive`，各插件 `createLive({ dirs, path })` 不再热重载页面。

- [ ] **Step 5: 手工** 改一个 css 文件，信使页不应整页闪；标签不应一直转。

---

### Task 7: 性能收口（丝滑的验收标准）

**Files:**
- Modify: `D:\dsh-plugins\dsh-work-ui\theme.css`（Google `@import` 改成本地或去掉，避免挡 iframe 文档加载）
- Modify: `mount.js`：路由切换 CSS `opacity` 120ms，不要 `animation:rise` 每次进场
- Modify: 各页 `watch`：指纹不变不改列表 DOM（信使已有，inbox/board 同样）

**验收（必须亲眼看，不能只靠单测）：**

1. 冷开「对话」正常。
2. 第一次点「信使」：骨架 < 200ms 出现（可先空列表再 pull）。
3. 之后在 信使 / 知识库 / 循环任务 / 记忆 / 待办 之间来回 10 次：中间不白、标签不转圈、侧栏和输入框不丢。
4. 离开信使后，DevTools Network 无每 2s `/plugins/dsh-messenger/state`；微信仍能收 `任务:`。
5. 列表超长只在框内滚。
6. 两步删除、投放区、Toast 仍在。

---

### Task 8: 旧 HTML 回退与清理

**Files:**
- 保留一周：`deskHtml` / `inboxHtml` / `boardHtml` / `atelierHtml` / `wallHtml` 路由
- `client.js` 全部改为 work-frame 后，删各插件里的 iframe `createElement`
- `memory-evolve` 的「记忆/技能/待办」React 页：不在本次重写；台账 Vue 盖在中间时不要再 `visibility:hidden` 整栏——改为 work-frame 只盖 `viewArea`，对话页把 frame `display:none`

**不要做：** 重写 memory-evolve、better-sidebar、对话 React、用 Vite 打包整仓。

---

## 任务顺序与可交付

| 顺序 | 做完时用户能看到 |
|---|---|
| 1–2 | 一个空壳 iframe，切页不再拆文档 |
| 3 | 信使已是 Vue，切换开始顺 |
| 4 | 知识库、循环任务进同一应用 |
| 5 | 五本台账不再套第二层 iframe |
| 6–7 | 大屏进去，Live 不再刷页，验收丝滑 |
| 8 | 旧 HTML 可删可留 |

每段独立可测；不要一次搬五页再跑。

## Self-review

- 卡顿五条原因都有对应任务（1–2 去 iframe，3 skip IMAP，6 去 live reload，5 去双层 Vue，7 去字体挡加载）。
- 未要求重写 DSH 对话壳。
- 无 TBD；口令与纸感写在 Global Constraints。
- `formatBeijingTime` 必须抽到无 `fs` 的 `time.js`，否则浏览器 `import store.js` 会炸。

---

## 执行方式

计划已写在 `docs/superpowers/plans/2026-08-16-vue-workbench.md`。

**1. 子代理按任务推进（推荐）** — 每做完 Task 停下来看一眼再开下一个  
**2. 本会话按 executing-plans 往下做** — 一批一批，中间给你看

说选哪个，并从 Task 1 开始。
