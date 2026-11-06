# 126 邮箱附件自动收件（mail-watch）

## 它做什么

每 10 分钟在后台（不弹窗）打开 126 收件箱，把**新邮件里的附件**下载到指定目录，按内容分流；只存附件，不存正文。

## 目录分流规则（`rules.json`，改这里就生效，不用改代码）

| 类型 | 判据（主题或文件名含关键词） | 落盘目录 |
|---|---|---|
| 试用/教师信息表 | 试用人员信息表、信息表、试用人员、人员信息 | `E:\桌面\办公文件\办公文档\2026年\10月\千问账号发送` |
| AI 课件/课例 | 课件、课例、应用案例、课间一刻钟、教学案例、教学设计 | `E:\桌面\办公文件\办公文档\2026年\10月\课件15分钟` |
| 拿不准 | 含 申报表/工作室/创想微造/课题/方案/合同/发票 等，或没命中任何规则 | `D:\dsh-workbench\mail\126\待确认`，并在结果 `needsConfirm` 里列出等你确认 |

文件名规则：`<发件人>__<原文件名>`，重名自动加 ` (2)`，不会互相覆盖。

## 不重复下载（三重去重）

1. **按邮件 mid**：`state.json` 里记过的一律不再点开，重跑同一天也是 0 次下载。
2. **按内容哈希**：`hash-index.json` 记 sha256；同名同内容视为重复，只记 `skipped`，不落盘。
3. **按落盘文件名**：目标目录已有同名文件时自动改名，不会覆盖已有文档。

## 运行方式（全后台，不弹 cmd）

- 计划任务 `DSH-126-mail-watch` → `wscript.exe run-hidden.vbs` → `run-watch.cmd` → `ego-browser nodejs watch126b.mjs`，窗口样式 0（隐藏）。
- ego 那个 `dsh-126-watch` 任务空间窗口常驻最小化，不会抢前台。
- 结果覆盖写 `last-run.json`（字段：`at / loggedIn / rows / checked / newMails / downloads / duplicates / needsConfirm / errors`）。
- 会话内另有每 30 分钟的播报提醒：有新附件或需要确认的文件才通知，没有就只说一句。

## 文件

- `watch126b.mjs`：主脚本
- `rules.json`：分流规则
- `reclassify.mjs`：按新规则迁移已下载的存量文件
- `run-watch.cmd` / `run-hidden.vbs`：无窗口启动器
- 状态：`D:\dsh-workbench\mail\126\{state.json,hash-index.json,last-run.json}`

## 已知边界

- 依赖 ego 里那个已登录的 126 账号，退出登录就收不到（`loggedIn=false` 会告警）。
- 计划任务是「仅当前用户登录时运行」，机器没登录不会跑。
- 126 附件链接是 `target=downloadFrame` 的 jsp，不触发浏览器下载事件，脚本是在页面内 fetch 取字节再落盘。
