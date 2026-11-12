# opendesign-design-mode

OpenDesign 设计模式的 DSH 插件包。装进 DeepSeek Harness（DSH）web 类型 profile 后，新会话选择器出现「OpenDesign 设计模式」入口：以本机安装的 OpenDesign 资产驱动设计会话（发现 → 计划 → 生产），产出八类 HTML 文件产物——原型、演示稿（ppt）、文档、营销源码、动效源码、HyperFrames 动效源码、网页复刻、webgl——产物直接在右侧栏**设计面板**预览。

本包与根包 `tai-ji-yang-shell`（太极视觉身份）是两个互相独立的插件：可各自安装、卸载，互不依赖；也可以装进同一个 profile 共存（共存回归由本包 e2e 的 S9 场景看守）。

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

- 新建会话时在选择器选择「OpenDesign 设计模式」入口（custom 分组）。会话可用的工具 = DSH standard 模式全量基线 + 本包四个子插件（persona、诊断命令、产物伺服、设计面板），preset 逐项显式声明、无隐式基线；质量环（落盘产物机器检查 + P0 发现自动回注自纠 + 产物写盘后自动补写锚属性）由包主行接线承载，不经 preset 子插件行。
- 产物在右侧栏设计面板预览；面板经 iframe 呈现本包伺服的产物，不嵌任意外部地址。
- **评论回路**：设计会话的预览面板右缘有评论侧栏——新建评论的唯一入口是产物内拾取：侧栏头部「评论模式」开关开启后，悬停预览产物中的元素出现高亮，点击即弹出评论输入框，发送后评论锚定到该元素（锚点三级降级：元素 id → `data-od-id` / `data-screen-label` 锚属性 → 结构路径；会话产物写盘完整后质量环自动为缺锚属性的 section 起始标签补写 `data-od-id`——拾取锚点自此常规落在锚属性级、评论跨改稿存活，用户项目文件与历史产物不补写，补写动作可经 `/opendesign-doctor` 第⑪节回查），落盘到会话工作目录的 `.od-comments/comments.json`（单文件权威，lock + 原子写），并作为独立来源消息回注当前会话（`source.kind='opendesign-design-mode/comment'`，不冒充用户发言，消息带锚点选择器与「改稿保留锚属性」指令），模型按锚点在产物源码中定位元素改稿写盘；线程带生命周期（open / resolved）与投递状态（pending / delivered / no-agent / inject-error）四值徽标，失败态可「重试投递」，已解决线程可追加评论自动重开；已评论元素在产物内钉编号徽章，点侧栏条目或徽章在产物内滚动定位并高亮，锚点失效（改稿后选择器不命中）时侧栏条目如实标注「锚点失效」并禁用定位。设备壳 iframe（`.od-frames/` 产物运行时依赖）内元素不可拾取——拾取脚本只注入被评审的产物 HTML 响应，壳内文档无拾取能力；面板不提供首评直发输入框（既有线程的追加输入保留在侧栏条目内）。
- **诊断**：会话内执行 `/opendesign-doctor` 可查看十二节报告——资产定位、清单版本、roster 完整性、改写命中、材质化状态、代际提示、异常恢复、止损位（前八节），以及资产丰富度（craft 册数 / 形状包数 / manifest 命中）、协议与检查器对账（panel / deck / 检查项清单版本锚与源码仓 clone 三态比对，clone 路径以 `/opendesign-doctor <clone 路径>` 命令参数登记）、质量发现（P0/P1/P2 记录、监听器状态、产物写盘身份）、评论环（评论文件存在性与线程计数、投递状态分布、parse 健康度与恢复动作、写通道路由族声明）；逐项降级带恢复动作。改写规则大面积失配（核心段失配达到阈值 / 默认读取器不可用 / 连续两版升级全量重写）时 doctor 输出「建议方案级重审」警示。
- **演示稿形态**：演示稿带 deck 协议信号——会话目录铺 `.od-frames/deck-framework.md` 协议文件（协议级翻页 / 打印分页 / OD Deck Protocol v1），ppt 任务档条目带指针，模型自读协议文件后按规范产出（协议级翻页与 Save-as-PDF 多页分页可用）。
- 设计会话会向会话工作目录的 `.od-frames/` 子目录写入 OpenDesign 设备壳支撑文件与 deck 协议文件（5 个小文件，会话创建时全量重铺），并在有评论时维护 `.od-comments/comments.json`。`.od-frames/` 是产物运行时依赖：删除会断开既有原型对手持壳的引用。建议把 `.od-frames/`、`.od-quality/` 与 `.od-comments/` 加进项目 `.gitignore`（前两个可随时删除、下次设计会话自动重建；`.od-comments/` 删除会丢评论历史，删除前确认）。

## V1 边界（明确不承诺）

- **图片 / 视频 / 音频成片生成不在 V1 范围**（依赖 OpenDesign 自身的 media 管线）：会话中提出此类请求时如实说明，并以 HTML 源码形态替代交付。
- **live-artifact**（数据看板自动刷新类产物）归后续版本。
- 评论按元素锚点挂靠（三级降级 id → `data-od-id` / `data-screen-label` → 结构路径），拾取入口覆盖产物文档内元素；结构路径级锚点对元素顺序敏感，改稿重排后可能失效（侧栏如实标注，可重新拾取或 resolve 关闭）；设备壳 iframe（`.od-frames/`）内元素不可拾取；评论数据为会话工作目录单文件（单用户场景），不做多用户并发与跨会话共享；评论卡片以宿主上下文折叠行呈现，不做 GenUI 卡片形态。
- 资产代际：插件按文本标记识别安装版 OpenDesign 的资产代际并适配；未能识别的版本 doctor 给出警告。

## 开发

- 架构简述见根仓 `docs/ARCHITECTURE.md` 的子包章节（locate 资产定位 / compose 会话组装 / materialize 材质化 / rewrite 改写规则 / protocols 协议登记 / quality 质量环 / comments 评论回路 / serve 产物伺服与评论写通道 / preview-tab 浏览器半场）；设计依据以源码注释为权威。
- 单测随根仓 `pnpm test` 收集；真实宿主 e2e 从仓库根执行 `pnpm test:e2e:design-mode`（web 与桌面 0.2.x 双版本，node 直跑，需本机 DSH 与构建产物）。
- 开发协作规范见根仓 `AGENTS.md`。

## License

[MIT](LICENSE)
