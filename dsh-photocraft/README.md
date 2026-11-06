# dsh-photocraft

把 `D:\PS-V\photocraft-cli.exe` 包成 DSH 插件：**批量去豆包 AI 水印**、**一键抠图**、**按参考图用画笔一比一作画**，并附一个网页工作台。

> 验证记录见文末「验证记录」：**e2e 53/53、web-e2e 27/27、sidecar selftest 30/30 全部通过**（2026-10-19 10:17），所有数字由 pc-verify 用 bundled 运行时独立复跑得出。

## 三个功能怎么用

插件注册 6 个工具，AI 直接调用即可（输入既可以是单文件，也可以是目录）：

| 工具 | 用途 | 关键参数 |
| --- | --- | --- |
| `photocraft_status` | 自检 CLI / Python / 目录是否就绪 | 无 |
| `photocraft_dewatermark` | 批量去除豆包风格右下角水印（自研检测 + 内容感知填充） | `input`、`output?`、`region?`(auto/bottom-right/bottom-left/bottom-band 或 `"x,y,w,h"` 手动框)、`padding?`、`method?`(fill/contentAware/patch)、`onMiss?`(skip/corner/fail) |
| `photocraft_cutout` | 一键抠图，输出带 alpha 的 PNG | `input`、`output?`、`refine?`、`decontaminate?`、`trim?`、`format?` |
| `photocraft_brush_paint` | 按参考图生成笔触计划并用画笔重画（可留 PSD 图层） | `input`、`output?`、`style?`(impressionist/pointillist/crosshatch/ink/pencil/flat)、`brushSize?`、`density?`、`passes?`、`jitter?`、`seed?`、`maxStrokes?`、`format?` |
| `photocraft_run` | 逃生通道：直接跑任意 CLI 命令链 | `input`、`steps`、`output?`、`format?`、`quality?` |
| `photocraft_commands` | 查 918 条命令注册表 | `filter?`、`json?`、`full?` |

对话里给图片路径即可，例如：

> 帮我把 D:/dsh-workbench/tmp/psv/bake-wm.png 的水印去掉

输出默认写到 `D:/dsh-workbench/photocraft/<yyyyMMdd-HHmmss>-<kind>/`，不覆盖同名文件。

## 网页工作台

DSH 启动后访问：**`/plugins/dsh-photocraft/`**

- 拖拽/选择图片 → 三张卡片（去水印 / 抠图 / 画笔）→ 调参数 → 运行 → 进度 + 前后对比预览 + 下载
- API：`/api/status`、`/api/upload`(multipart)、`/api/run`、`/api/job`、`/file?path=`（限工作根内）
- 会话里还有一张「打开 PhotoCraft 工作台」卡片（`lib/client.js` 的 conversation.view）

## 目录

```
dsh-photocraft/
  package.json  cordis.patch.yml
  lib/          index.js cli.js python.js paths.js watermark.js cutout.js paint.js http.js client.js ui/
  sidecar/      detect_watermark.py brush_plan.py pc_common.py selftest.py
  test/         harness.mjs loader.mjs stub.mjs e2e.mjs web-e2e.mjs check_outputs.py
```

## 验证记录

由 pc-verify 独立复跑（2026-10-19 10:17，Asia/Shanghai），不采信任何队友转述；失败项也照实写。

环境（实测）：Windows；`photocraft-cli 0.10.0 (8407d9ccb, 2026-10-18)`；bundled Python **3.12.14**（Pillow 12.3.0 / numpy 2.3.5）；bundled Node **v24.21.0**。
样本：`D:/dsh-workbench/tmp/psv/` 下 `bake-wm.png`（水印真值 bbox `880,698,232,54`，logo 从 x=890 起）、`bake-clean.png`(1200x800)、`cutout-subject.png`(600x600，主体 bounds `180,120,241,401`)、`photo-*.png`。

运行命令：

```
<node>   test/e2e.mjs        # fake ctx 加载插件 + 6 工具真实调用 + sidecar 契约 + 像素断言（53 项）
<node>   test/web-e2e.mjs    # 真实 node:http 挂路由，跑页面/upload/run/job/file + 403/越界（27 项）
<python> sidecar/selftest.py --max-strokes 1500   # sidecar 自带自测（30 项）
<python> test/check_outputs.py <subcommand> ...   # 像素级断言（由 e2e 内部调用）
```

### 1. test/e2e.mjs — **53/53 PASS**，总耗时 **19.87s**

| 断言组 | 实测数字 | 结论 |
| --- | --- | --- |
| A. apply/load + 6 工具注册 | `photocraft_status/dewatermark/cutout/brush_paint/run/commands` 全部 registered | PASS ×7 |
| B. status/execute、cli、python、dirs.samples | CLI 0.10.0；`Python 3.12.14`；`dirs.samples=D:/dsh-plugins/dsh-photocraft/samples`（exists=true） | PASS ×4 |
| C. detect_watermark 契约 | `bake-wm.png` bbox `[880,694,230,56]` **IoU=0.8894**（阈值 0.85）、conf=0.84、0.284s；`bake-clean.png` **found=false**；两次退出码均 0 | PASS ×4 |
| D. dewatermark 像素 | bbox `[876,690,238,64]`（rawBbox `[890,704,210,36]`、conf 0.84、method fill、pixels 15232）；**region-mae=0.4908**（<4）、full-mae=0.0067；未处理→输出 delta=62.0699；干净图 onMiss=skip → `{total:1,ok:0,failed:0,skipped:1}` | PASS ×4 |
| E. cutout 像素 | 输出 **RGBA**，`alpha==0` 占比 **0.8371**（>0.5），中心 (300,320) alpha=255，opaque 0.1629，bounds `[180,120,241,401]`，0.233s | PASS ×3 |
| F. brush_paint | **顶层 strokes=800** 且 === `files[0].strokes`；`planPath` 存在、`planPaths` 含该路径；灰度 std=41.3938、**灰度相关 0.9934**（>0.5）；`summary={total:1,ok:1,failed:0,skipped:0}`；1.06s | PASS ×5 |
| G. brush_plan 契约 + PSD | 800 笔全部落在画布内；同 seed 两次 **plan 字节一致**；strokes=800≤800；PSD batch rc=0，`info` 图层含 **paint**(id3, selected) + Background | PASS ×6 |
| H. commands / run | 注册表 **918** 条，filter=`paint.stroke` → matched=1、returned=1，缓存 `D:/dsh-workbench/photocraft/cache/commands.json`；`layer.new.layer` rc=0、0.194s | PASS ×3 |
| I. 契约边界 | 目录递归 2 文件（1 成功 + 1 skip）；同名输出不覆盖（a-wm-6 → a-wm-7）；手动 `region="880,698,232,54"` regionSource=manual、MAE=0.4908/0.0067；三条精确报错（`输入不存在：<abs>` / `不支持的输出格式：xyz（可用 png / jpg / webp / psd / tif）` / `未知清除方式：teleport（可用 fill / contentAware / patch）`）；预中止 signal → `aborted=true`、summary 全 0 | PASS ×9 |
| I2. 内容保护 | `onMiss=corner` 强制擦右下角：bbox `[652,616,548,184]`；**bbox 外 MAE=0.000000、最大像素差=0**（859168 个区域外像素逐像素不变）；bbox 内 delta=18.7434 | PASS ×2 |
| J. 六风格 sweep（独立复验） | 全部 `strokes=1500`（≤1500）、plan 校验 in-bounds、同 seed 两遍字节一致：impressionist cov=0.8645/0.421s、pointillist 0.1914/0.361s、crosshatch 0.2424/0.371s、ink 0.3142/0.315s、pencil 0.3164/0.308s、flat 0.8137/0.347s | PASS ×6 |

### 2. test/web-e2e.mjs — **27/27 PASS**

| 断言组 | 实测数字 | 结论 |
| --- | --- | --- |
| A. 路由注册 | **apply() 返回瞬间 routes=12**（静态 import 生效，无需轮询）；含 `/api/job/cancel`、`/api/open-dir`；8 条关键路由逐一 registered | PASS ×10 |
| B. 页面与静态资源 | `/` 200 `text/html` 9229B；`app.js` 200 `text/javascript` 18264B；`style.css` 200 `text/css` 16562B；页面文本同时出现「去水印/抠图/画笔」 | PASS ×4 |
| C. /api/status | 200，cli 0.10.0、python 3.12.14 | PASS ×3 |
| D. /api/upload（真实 multipart） | 200，id `1eea0ade399c186c`，落盘 `D:/dsh-workbench/photocraft/inbox/1eea0ade399c186c-bake-clean.png`（1289957B） | PASS ×2 |
| E. sameOrigin | 跨域 Origin `http://evil.example` → **403** `{"error":"forbidden"}`（缺 Origin → 200，信息性记录，见遗留 2） | PASS ×1 |
| F. /api/run → /api/job | run 200 返回 jobId；job `state=done`、ok=1、failed=0（808ms）；results 含 `/file?path=` 的 `url`/`sourceUrl` | PASS ×3 |
| G. /file 预览与越界 | 结果图 200 `image/png` 993086B；`../../../../Windows/win.ini`、`C:/Windows/win.ini`、工作根外的 `D:/dsh-workbench/tmp/psv/bake-clean.png` 全部 **403** | PASS ×4 |

### 3. sidecar/selftest.py — **30/30 graded PASS**（pc-verify 亲自运行，未采信转述）

| 断言组 | 实测数字 | 结论 |
| --- | --- | --- |
| 水印检测 | `bake-wm` IoU=0.8894 conf=0.84 0.284s（<2.0s 预算）；`photo-watermark` IoU=0.5523 conf=0.93；`bake-clean`/`photo-clean`/`cutout-subject` 全部 found=false | PASS ×6 |
| 六风格 plan 合法性 | 6 风格全部 strokes=1500（≤1500），coverage 0.2440–0.9170，耗时 0.987–1.755s | PASS ×12 |
| 六风格确定性 | 同 seed7 逐字节一致，seed8 必变（6/6 风格） | PASS ×12 |

### 契约偏差的发现与修复（本轮已闭环）

| 发现 | 位置 | 处置 |
| --- | --- | --- |
| 画笔返回对象顶层缺 `strokes`/`planPath`（规格 §4 要求顶层；原先只在 `files[]`） | `lib/paint.js` | 已上报 pc-core 并修复：顶层现有 `strokes`(求和) / `planPath` / `planPaths`；e2e 的 `paint/top-level-fields` 断言验证三者自洽 → PASS |
| `apply()` 返回时网页路由可能尚未注册（`void (async () => … import("./http.js"))`） | `lib/index.js:335` | pc-core 改为顶层静态 `import { registerWorkbench } from "./http.js"`；e2e 新增硬断言 `routes/immediate-on-apply` → 返回瞬间 12 条，PASS |
| `photoStatus.dirs.samples` 指向不存在目录 | `lib/index.js` | pc-core 改为「目录不存在返回 null」；实测 `samples` 现已存在 = `D:/dsh-plugins/dsh-photocraft/samples`；断言接受 null 或真实存在 → PASS |
| `sidecar/brush_plan.py` 早期版本崩溃（`AttributeError: 'tuple' object has no attribute 'mode'/'shape'`，脚本按契约仍 rc=0 并输出 `{ok:false}`） | `sidecar/brush_plan.py:338` | pc-verify 提供最小复现 → pc-sidecar 修复（`load_image`/`downsample_rgb` 返回 tuple 的调用处）；现已全绿 |

### 遗留问题（照实记录，不粉饰）

1. **低危偏差**：`lib/http.js` 的 sameOrigin 在 **Origin 与 Referer 都缺失** 时回落到 host 判断并放行（web-e2e 记为 INFO，非断言）；参考实现 `dsh-datacenter/lib/http.js` 此时会 403。浏览器跨站请求必带 Origin（已实测 403），故未阻塞交付。
2. **测试脚本自身教训**：`test/harness.mjs` 第一版会把工具返回值里的 `input` 路径误当输出（曾出现 region-mae=61.5792、paint corr=1.0 的假象）；已改为只取 `files[].output`/`output` 且排除输入路径，上表数字均为修正后结果。
3. **运行环境依赖**：验证基于本机 `D:/PS-V/photocraft-cli.exe` 与 bundled Python/Node；换机器需确认这两个路径（可用 `PHOTOCRAFT_CLI`/`PHOTOCRAFT_PYTHON` 环境变量或插件 config 覆盖）。
