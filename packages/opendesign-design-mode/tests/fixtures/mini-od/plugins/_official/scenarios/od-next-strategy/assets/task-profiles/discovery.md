<!--
  fixture 摘录：OD 仓 .../assets/task-profiles/discovery.md（0.25.1 检出原文，2026-11-09）。
  收录全量目录占位符段（原文 L11-15）。事实（设计 V1·D6 排除理由的核实锚点）：
  {{SKILL_CATALOG}}/{{SKILL_ROOT}} 占位符在 13 个任务档中仅出现于本档——
  照抄渲染会把媒体档路径引入提示词绕过媒体排除，故 V1 不注入 discovery 档
  （其「未定形态请求先选择交付物」职责由路由指令段首轮选择引导承担）。
  fixture 供占位符白名单过滤断言（V1·RL3）与 V1·U4 特征串扫描用。
-->
# OD Next Discovery（fixture 摘录）

## Candidate catalog

（原文 L11-15：全量目录占位符——渲染白名单过滤的目标形态）

{{SKILL_CATALOG}}

## Selection rules

1. After the production-authorization gate above, select by the result the user
   actually wants. An explicit deliverable in the Query takes precedence over a
   conflicting manually selected type.
