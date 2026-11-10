<!--
  fixture 摘录：OD 仓 .../assets/task-profiles/web-clone.md（0.25.1 检出原文，2026-11-09）。
  八类路由之网页复刻档；收录开头两段（原文 L3-5）——「用运行时既有 browser/fetch 工具
  读目标页、不装浏览器」语义是 V1·U1 子插件清单声明 tool-web 的依据（设计 V1·D6）。
-->
# OD Next Web Clone Task Profile v3.1.1（fixture 摘录）

Rebuild functional HTML from user-specified pages, screenshots, or source files,
with route=web-clone-html and kind=prototype. Read the actual source first and
establish page scope, content, and interactions to preserve. Do not invent a
page from memory of a website.

Prefer browser/fetch tools already available in the current runtime to read the
specified pages and necessary assets. Read-only inspection of input pages may
inform the request; do not start a separate evaluation process after delivery.
Do not install browsers or change network security settings. State specific gaps
and clarify when access is unavailable, login is required, or sources are
incomplete; do not bypass login or permissions.
