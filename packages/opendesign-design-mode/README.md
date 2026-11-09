# opendesign-design-mode

OpenDesign 设计模式的 DSH 插件包。装进 DeepSeek Harness（DSH）web 类型 profile 后，新会话选择器出现「OpenDesign 设计模式」入口：以本机安装的 OpenDesign 资产驱动设计会话（发现 → 计划 → 生产），产出八类 HTML 文件产物——原型、演示稿（ppt）、文档、营销源码、动效源码、HyperFrames 动效源码、网页复刻、webgl——产物直接在右侧栏**设计面板**预览。

本包与根包 `tai-ji-yang-shell`（太极视觉身份）是两个互相独立的插件：可各自安装、卸载，互不依赖；也可以装进同一个 profile 共存（共存回归由本包 e2e 的 S8 场景看守）。

## 前置条件

- DSH 满足版本门禁 `>=0.1.7-rc.2 <0.3.0`（与根包同范围；门禁语义见根 README「版本门禁」）。
- 本机安装 OpenDesign。**未安装不是故障**：入口与面板显式降级提示（说明缺什么、怎么装），不静默假装可用。
- PATH 上有 pnpm（`dsh plugin` 转发安装给 pnpm）。

## 安装

从本仓库根先构建（产物入库时已随仓交付，改动源码后需重建）：

```bash
git clone https://github.com/zhushanwen321/tai-ji-yang.git
cd tai-ji-yang && pnpm install && pnpm build

# 装进 web 类型 profile（指向本包目录）
dsh plugin --profile web add packages/opendesign-design-mode
```

桌面应用（desktop profile）的安装通道、卸载与停机重启规则与根包一致，见根 README「桌面应用」与「排障」节；卸载命令的包名换成本包：`dsh plugin --profile <profile> remove opendesign-design-mode`。

## 使用

- 新建会话时在选择器选择「OpenDesign 设计模式」入口（custom 分组）。会话可用的工具 = DSH standard 模式全量基线 + 本包四个子插件（persona、诊断命令、产物伺服、设计面板），preset 逐项显式声明、无隐式基线。
- 产物在右侧栏设计面板预览；面板经 iframe 呈现本包伺服的产物，不嵌任意外部地址。
- **诊断**：会话内执行 `/opendesign-doctor`——查看资产定位结果、OpenDesign 版本画像、改写规则命中清单、材质化状态与逐项恢复动作；改写规则大面积失配（核心段失配达到阈值 / 默认读取器不可用 / 连续两版升级全量重写）时 doctor 输出「建议方案级重审」警示。
- 设计会话会向会话工作目录的 `.od-frames/` 子目录写入设备壳支撑文件（4 个小文件）；它是产物运行时依赖，可随时删除，下次设计会话自动重建——建议把 `.od-frames/` 加进项目 `.gitignore`。

## V1 边界（明确不承诺）

- **图片 / 视频 / 音频成片生成不在 V1 范围**（依赖 OpenDesign 自身的 media 管线）：会话中提出此类请求时如实说明，并以 HTML 源码形态替代交付。
- **演示稿**交付为普通单文件 HTML（含翻页 / 打印脚本）；OpenDesign 协议级翻页与打印分页为后续版本。
- **live-artifact**（数据看板自动刷新类产物）归后续版本。
- 资产代际：插件按文本标记识别安装版 OpenDesign 的资产代际并适配；未能识别的版本 doctor 给出警告。

## 开发

- 架构简述见根仓 `docs/ARCHITECTURE.md` 的子包章节（locate 资产定位 / compose 会话组装 / materialize 材质化 / rewrite 改写规则 / serve 产物伺服 / preview-tab 浏览器半场）；设计依据以源码注释为权威。
- 单测随根仓 `pnpm test` 收集；真实宿主 e2e 从仓库根执行 `pnpm test:e2e:design-mode`（web 与桌面 0.2.x 双版本，node 直跑，需本机 DSH 与构建产物）。
- 开发协作规范见根仓 `AGENTS.md`。

## License

[MIT](LICENSE)
