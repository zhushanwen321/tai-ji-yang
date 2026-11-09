<!--
  fixture 摘录：OD 仓 .../assets/task-profiles/motion-design.md（0.25.1 检出原文，2026-11-09）。
  收录 media-video 路由要求段（原文锚点 L37/L305/L330/L401，2026-11-09 grep -n 复核）。
  事实与语义定位（设计 D6/V7）：本档经运行时模型自读原文进入上下文——不经系统提示词注入、
  不经改写器（改写器只作用于注入文本，机制上触达不到自读文件）；档内「MP4 必交付 + 媒体命令」
  要求的 V1 压制载体 = 路由指令段条目级指令（U3 组装）。fixture 供 V7 断言语义对照。
-->
# OD Next Motion Design Task Profile（fixture 摘录）

（原文 L37 附近：成片必交付要求）

For a video brief (a timed film, promo, explainer or showreel), declare BOTH
editable HTML source and MP4 as required deliverables. Rendering the MP4 is
Build production and must finish before delivery.

（原文 L305 附近：参考视频即成片语义）

**A reference video makes this a video brief.** The reference is itself a
film, so the delivery is a film: MP4 is required, the production route is
`hyperframes-html`, and the editable source is a HyperFrames composition.

（原文 L328-332 与 L399-403：媒体命令段——V1 不可执行的命令形态，V7 断言模型全程
 不调用此类命令形态）

   `"$OD_NODE_BIN" "$OD_BIN" media scaffold --project "$OD_PROJECT_ID" --composition-dir "motion-source/film"`,
   author the composition, then
   `"$OD_NODE_BIN" "$OD_BIN" media generate --project "$OD_PROJECT_ID" --surface video --model hyperframes-html --composition-dir "motion-source/film" --output "<name>.mp4"`.

   If it returns a task ID, use `"$OD_NODE_BIN" "$OD_BIN" media wait <id>` and
   wait for success. A queued task, HTML preview or failed command is not a
   completed film.
