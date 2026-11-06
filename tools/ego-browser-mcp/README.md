# ego-browser MCP 插件（给 DSH 用）

把 [ego lite](https://github.com/citrolabs/ego-lite) 浏览器封装成 MCP 工具，让 DeepSeek Harness 在任何浏览器任务里直接调用，而不是每次都手写 `.mjs` 脚本或换别的浏览器栈。

## 组成

| 文件 | 作用 |
|---|---|
| `server.mjs` | MCP stdio server，单文件、零依赖，Node 18+ |
| `test-client.mjs` | 本地握手自测：initialize → tools/list → open/snapshot/screenshot |

## 注册位置

`C:\Users\HY\.dsh\cordis.patch.yml`（机器级 patch，优先级高于 profile patch）：

```yaml
    - id: ego-browser-mcp
      name: "@deepseek-ai/dsh-mcp-client"
      config:
        serverName: ego
        transport: stdio
        command: D:\DevTools\nodejs\node.exe
        args:
          - D:\dsh-workbench\ego-browser-mcp\server.mjs
        toolCallTimeoutMs: 300000
```

工具名形如 `mcp__ego__browser_open`。**改完 patch 必须完全退出 DSH 再启动**（patch 只在启动时读一次）。

## 工具

| 工具 | 说明 |
|---|---|
| `browser_open {url, page?}` | 打开网址，返回 url/title/page/spaceId |
| `browser_snapshot {page?, fullPage?, maxChars?}` | 语义化 DOM 快照，带 `@ref` 可点引用 |
| `browser_click {selector, page?}` | 支持 `@21` / `ref=21` / `text=登录` / `loc=css:` / `loc=role:button[name='确定']` / `xpath=` / 裸 CSS |
| `browser_fill {selector, text, submit?, page?}` | 填输入框，`submit=true` 填完按 Enter |
| `browser_extract {script, page?}` | 页面内跑 JS 取数（**必须是字符串**，0.6.2.5 传函数会 `Runtime.evaluate wasn't found`） |
| `browser_screenshot {path?, page?}` | 截图，`path` 要绝对路径 + 正斜杠；**ego 窗口最小化时会失败** |
| `browser_tabs {}` | 列出任务空间里的标签页 |
| `browser_run {script}` | 跑任意完整 ego 脚本（stdout 原样返回） |
| `browser_close {keep?}` | `finish()` 收尾 |

## 实现要点（踩过的坑）

- **脚本经 stdin 传入**：`ego-browser nodejs` 支持 stdin 转发，避免 PowerShell 引号/编码地狱（中文只能留在文件里）。
- **结果走 stderr**：0.6.2.5 里嵌入 Node 的 `console.log` 输出到 stderr，所以标记 `@@RESULT@@` 在两路流里都找。
- **任务空间持久**：空间名默认 `dsh-browser`，多次调用共享 space / 标签 / 页标签 `p1`；每次调用都是新 Node 进程，变量不保留。
- **CLI 自动探测**：扫描 `C:\Program Files\Citro Labs\ego lite\Application\<version>\ego-browser.exe` 取最高版本；可用 `EGO_BROWSER_CLI` 覆盖。
- **超时**：默认 180s，`EGO_BROWSER_TIMEOUT_MS` 可调。
- 依赖 ego lite 桌面端在运行；首次装完需在 UI 里完成 onboarding 才会把 `ego-browser` 加进 PATH（本插件不依赖 PATH）。

## 和上游官方手册的关系（重要）

上游仓库 `citrolabs/ego-lite` 里确实有官方 DSH 集成，但**不是 MCP**：

- `plugins/ego/dsh/src/index.js` 是一个 cordis 插件，`inject: ["skills"]`，只做一件事：
  注册一个 **skill provider**（provider 名 `ego`、`source: "bundled"`、`rank: 600`），
  把包里那份 canonical `ego-browser` SKILL.md 通过 Skill 通道暴露给宿主。
- `plugins/ego/cordis.patch.yml` 就三行：`- insert: [{ id: ego, name: '@citrolabs/ego/dsh' }]`。
- 官方 README 给的 DSH 安装路径是：
  `tar -xzf ego-deepseek-harness-v2.1.0.tgz` → `dsh plugin --profile web add …/package`。
  但 **npm 上并没有 `@citrolabs/ego-deepseek-harness` 这个包**（`npm view` 返回 404），
  本机也没有 `dsh` 命令，所以官方的"一键装"目前走不通，只能从源码 `npm --prefix plugins/ego run package` 自己打。

结论与取舍：

1. 官方插件 = 把 Skill 注册进去；而 `~/.agents/skills/ego-browser` 里已经装着**同一份** canonical Skill
   （ego lite 安装时自动投放，`ego-browser skill` 输出的 guide 就来自它），DSH 已经能加载它
   → 功能上已等价于官方插件，不需要再打 tarball。
2. 官方模型是 **Skill + CLI，一轮一个脚本**；MCP 是额外加速层（单步爽，多步反而多起进程）。
   所以复杂流程请走 `browser_run` 一次跑完整脚本，别一步一个工具硬拆。
3. 手册另外几条我们已经遵守/需要遵守：窗口不能最小化才能截图；`page.evaluate` 传字符串；
   Snapshot 是语义化 DOM（iframe/shadow DOM 已解）；用户自己的标签页先 `adopt`。

上游文档：`README.zh-CN.md`、`docs/ego-browser-skill-command.md`、`plugins/ego/README.md`。

## 自测

```powershell
node D:\dsh-workbench\ego-browser-mcp\test-client.mjs
```

预期：initialize 返回 `serverInfo.name=ego-browser`，9 个工具，`browser_open https://example.com` 返回 `"title": "Example Domain"`，截图落到指定路径。
