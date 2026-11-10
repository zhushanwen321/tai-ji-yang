<!--
  fixture 摘录：OD 仓 .../assets/task-profiles/hyperframes.md（0.25.1 检出原文，2026-11-09）。
  八类路由之动效源码档；收录 Artifact contract 段（原文 L35-40）——交付物 = timeline
  驱动 HTML 源码、MP4 由产品侧渲染且在 Agent 职责外（该档纯 DSH 可达的依据，设计 V1·D6）。
-->
# OD Next HyperFrames Task Profile（fixture 摘录）

## Artifact contract

（原文 L37-40）

For a HyperFrames composition, the default deliverable is editable HyperFrames
source — a timeline-driven HTML composition. MP4 are rendered by Open Design's
product-side engineering capability after the source is written and are outside
the Agent's responsibility, unless the user explicitly requires an actual MP4 too.

（原文 L177：源码交付与可选成片的边界）

Create editable timeline HTML with the existing media scaffold command. Read its
generated index.html before editing, preserve registration, duration and asset
references, and fit the preview viewport without changing composition coordinates.
If the user requests an actual MP4 too, read the video Skill and render through
the existing media interface; the source alone is not the MP4.
