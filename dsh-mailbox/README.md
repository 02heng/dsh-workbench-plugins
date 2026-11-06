# dsh-mailbox · 邮箱收件台

把「老师报送邮件」变成流水线：**IMAP 收信 → 自动解压 → 按通知/学校改名归档 → 收件台账 + 缺件清单**。
装进 DSH 后，在会话里用 8 个工具，在浏览器里用工作台 \`/plugins/dsh-mailbox/\`。

## 为什么这样设计

- **取回原件而不是转发正文**：每封邮件落 \`raw/<日期>/<uid>-<主题>/\`，保留 \`mail.eml\` 与附件原件，出问题可回溯。
- **命名口径写死在配置里**：单件名、压缩包名、邮件主题三处统一，避免「各校各写一套」。
- **归档目录按规则映射**：规则命中关键词就进对应通知目录，再按学校分文件夹；不给规则就进 \`inbox/待人工\`，绝不乱放。
- **台账与缺件清单自动生成**：\`ledger/收件台账-YYYY-MM.xlsx\` 可直接给领导看；缺件写 \`缺件清单-YYYY-MM.md\`。
- **凭据只在本机**：授权码存 \`secret.json\`，工具与日志都不回显。

## 安装

\`\`\`powershell
node scripts/install-profile.mjs desktop web
\`\`\`

然后完全退出并重开 DSH。工具列表出现 \`mailbox_*\`，浏览器打开 \`http://127.0.0.1:<端口>/plugins/dsh-mailbox/\`。

## 首次使用

1. 打开工作台，填邮箱与**客户端授权码**（126：设置 → POP3/SMTP/IMAP → 开启 IMAP → 生成授权码），点「保存配置」→「测试连接」。
2. 填「归档根目录」（例：\`E:/桌面/办公文件/办公文档/2026年/10月\`）。
3. 加通知规则：规则名=通知名，关键词=邮件主题/正文里的识别词，落盘目录留空即 \`归档根目录/通知名\`。
4. 点「预览整理」看会往哪放，再点「一键收取」。

## 工具

| 工具 | 作用 |
| --- | --- |
| \`mailbox_status\` | 配置/规则/上次结果/待整理数/工作台地址 |
| \`mailbox_config\` | 读写配置（含授权码，写入不回显） |
| \`mailbox_scan\` | 只收信：IMAP 取新邮件并落 raw |
| \`mailbox_process\` | 只整理：解压、改名、归档、台账 |
| \`mailbox_run\` | 一键：收信 + 整理 |
| \`mailbox_ledger\` | 读台账（按月） |
| \`mailbox_send\` | 回执/通知批量发信（默认干跑，\`send:true\` 才发） |
| \`mailbox_selftest\` | 离线自检（不连网、不发信） |

## 目录结构（数据根 \`D:/dsh-mailbox\`）

\`\`\`
raw/20261023/12-关于征集…/     mail.eml  body.txt  attachments/
ledger/收件台账-2026-10.xlsx   缺件清单-2026-10.md
logs/mailbox.log
config.json  secret.json  state.json
\`\`\`

## 定时

\`schedule.times\` 默认 \`08:30\`、\`17:00\`。插件每 60 秒检查一次，命中且当日未跑过、且已存授权码才执行；结果写 \`state.json\` 并尝试通过 \`dsh-notification\` 发通知。\`autoSchedule: false\` 可关。

## 测试

\`\`\`powershell
node test/e2e.mjs        # 16 项：包声明、文件、sidecar 自检、工具、路由、配置、HTTP
node test/web-e2e.mjs    # 7 项：真实 node:http 挂载 + 跨站拦截 + 自检链路
python sidecar/selftest.py --work D:/dsh-mailbox/selftest --clean 1   # 21 项
\`\`\`

## 已知限制

- **rar**：本机没有 7-Zip/WinRAR，只尝试 7z 命令；zip/tar/gz 原生支持。
- **IMAP 首次登录**：126 可能要求先在网页版开启 IMAP；登录失败时看 \`logs/mailbox.log\` 的 \`Unsafe Login\` 提示。
- **同名冲突**：落盘重复时自动加 \`(2)\`、\`(3)\`，不会覆盖。
- **手机号脱敏**：正文与台账里的手机号一律写「【手机号已隐去】」，座机保留。
