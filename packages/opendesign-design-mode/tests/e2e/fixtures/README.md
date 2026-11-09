# tests/e2e/fixtures/ 目录索引

e2e 场景专用 fixture（消费方：U8 双版本 e2e 套件，场景编号见设计 §4 V1-V11 / RL1-RL8）。
上游参照与升级对账同 `tests/fixtures/README.md`；漂移场景（V6）复用 `tests/fixtures/drift-od/`，不在本目录重复。

## 子目录一览

| 目录 | 内容（一句话） | 场景 | 用法 |
|------|----------------|------|------|
| `empty-assets/` | 空目录（仅 `.gitkeep` 保位）——无资产环境 | V5 / RL5 | e2e 把插件的资源根环境变量指向本目录（隔离 DSH_HOME、无 OD 安装），断言 preset 以「未检测到 OpenDesign」降级：roster 不出现该模式、设置页有诊断与安装指引、无法进入残缺会话 |
| `si3-broken-manifest/` | 存在但清单损坏的资源根（open-design.json 为截断 JSON）——「已装但探测失败」假阳性形态 | V5 / SI3 收窄 | e2e 把资源根环境变量指向本目录，断言诊断文案区分两种形态：本目录形态应报「检测失败请重启 DSH 重试」而非「未检测到 OpenDesign」（信号-蕴涵表 SI3） |
| `probe-artifact/` | 内嵌探针脚本的产物 index.html + 伺服根内非产物文件 secret-note.txt | V10 / RL8 | e2e 把整个目录拷入会话 cwd（= 伺服根），设计面板 iframe 载入产物触发探针；探针把结果写进 DOM（见下），断言隔离语义生效 |
| `resume-gen1/`、`resume-gen2/` | 两代迷你资产树：gen2 相对 gen1 改版本号（manifest 3.3.7→3.3.9、core 3.2.0→3.2.1）并改一处可断言的提示词内容 | V9 / RL7 | e2e 先指 gen1 创建设计会话 → 关闭 → 资源根改指 gen2（模拟 OD 升级）→ resume → 断言新一轮系统提示词含 gen2 特征句、无 gen1 特征句与旧代际版本残留；doctor 报告资产代际差异 |

## probe-artifact/ 探针与 DOM 契约

探针脚本在产物载入后**依次**执行三组尝试，结果同时写入单个聚合节点与三个独立节点（均为 `textContent`，便于 e2e 按 id 取文本断言）：

| DOM 节点 id | 探针内容 | 隔离生效时的预期形态 |
|-------------|----------|----------------------|
| `#probe-open` | `fetch('/open-in-app/open', { method: 'POST', … })`——宿主 open-in-app 的 POST open 路由（路径实名依据：DSH 仓 `packages/host/open-in-app/src/shared.ts` 的 `OPEN_IN_APP_OPEN_PATH = '/open-in-app/open'`） | fetch 被拒（opaque origin 下跨域受限）或响应不可读；不得出现 `status=200` 与响应体泄漏 |
| `#probe-secret` | `fetch('./secret-note.txt')`——伺服根内非产物文件 | 内容不可得；不得出现 canary 串 `SECRET-NOTE-CANARY` |
| `#probe-cookie` | `document.cookie` 读取 | 隔离生效形态 = `cookie: (empty)` 或 `cookie: blocked SecurityError: …`（sandbox 无 allow-same-origin 时 Chromium 对 cookie 读取本身抛 SecurityError，0.1.7 web / 0.2.2 桌面双版本实测）——不得出现真实 cookie 值 |
| `#probe-results` | 上述三项的 JSON 聚合（单节点断言入口） | 同上 |

`secret-note.txt` 内容含 canary 串 `SECRET-NOTE-CANARY`：该串出现在产物 DOM 中即判定伺服根非产物内容泄漏（RL8 红灯，按设计 D7 兜底切独立 origin 伺服并记录）。

## resume-gen1 / resume-gen2 的可断言差异

- 版本号：manifest `version` 3.3.7→3.3.9；core 资产 `od.strategy.assets.core.version` 3.2.0→3.2.1。
- 提示词内容：gen1 core 含句 A「For standalone image generation, deliver the actual image file. …」（OD 原文 L114-119 摘录）；gen2 core 以句 B（升级模拟句，**非 OD 原文**，文件头注释已标注）替换句 A。断言：resume 后注入文本含句 B、不含句 A。
