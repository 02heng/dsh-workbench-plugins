# dsh-workbench-plugins

智慧教育工作台自研 DeepSeek Harness 插件。本仓库只放我们写的插件，不含 `deepseek-harness` 源码。

## 自研插件

| 目录 | 作用 |
|---|---|
| `dsh-craft` | 问 / 想 / 做、任务卡、选区改稿、目标、审稿、检索 |
| `dsh-dashboard` | 数据大屏、页签、纸感台账 |
| `dsh-datacenter` | 循环任务 / 值班台 |
| `dsh-edu-kb` | 知识库 |
| `dsh-office` | Office 读写、文档收件箱 |
| `dsh-messenger` | 微信派活、QQ 信匣 |
| `dsh-vision` | 看图 / OCR |
| `dsh-cursor-llm` | 对话走 Cursor 模型路由 |
| `dsh-cursor-delegate` | 把编码任务派给 Cursor Agent |
| `dsh-themes-ui` | 工作台主题 |
| `dsh-work-ui` | 共用纸感样式和热更新 |
| `mcp-server-memory` | 本机 memory MCP |

装进 profile：

```sh
dsh plugin --profile web add github:02heng/dsh-workbench-plugins
```

或把本仓库放到 `D:\dsh-plugins`，在 profile 里 `link:` 各个子目录。

路径默认写在 D 盘：`D:\dsh-workbench`、`D:\dsh-kb`。

## 本机还在用、但已有上游仓库的插件

这些没有收进本仓库，请从原地址安装：

- [dsh-genui](https://github.com/omdsh-dev/dsh-genui)
- [dsh-sentinel](https://github.com/fuhefei/dsh-sentinel)
- [dsh-book2skill](https://github.com/omdsh-dev/dsh-book2skill)
- [dsh-memory-evolve](https://github.com/csyangwen/dsh-memory-evolve)
- [dsh-worktree](https://github.com/FlashingChen/dsh-worktree)
- [dsh-at-file](https://github.com/omdsh-dev/dsh-at-file)
- [DSH-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar)
- [dsh-skillport](https://github.com/Jesse-njx/dsh-skillport)
- [dsh-checkpoint-rewind](https://github.com/PerryLink/dsh-checkpoint-rewind)
- [dsh-find-plugin](https://github.com/awesome-dsh-plugin/dsh-find-plugin)
- [dsh-notification](https://github.com/omdsh-dev/dsh-notification)
- [dsh-plugin-claude-bridge](https://github.com/YYTbit/dsh-plugin-claude-bridge)
- [dsh-win-gitbash](https://github.com/buhuikongpan/dsh-win-gitbash)
- [dsh-agent-teams](https://github.com/NanmiCoder/dsh-agent-teams)
- [dsh-market](https://github.com/dsh-market/dsh-market)
- [dsh-browser](https://github.com/Lum1104/dsh-browser)
