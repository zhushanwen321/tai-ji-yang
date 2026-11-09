---
name: dashboard
description: |
  Admin / analytics dashboard in a single HTML file. Fixed left sidebar,
  top bar with user/search, main grid of KPI cards and one or two charts.
  Use when the brief asks for a "dashboard", "admin", "analytics", or
  "control panel" screen.
triggers:
  - "dashboard"
  - "admin panel"
  - "analytics"
  - "control panel"
  - "后台"
  - "管理后台"
od:
  mode: prototype
  platform: desktop
  scenario: operations
  preview:
    type: html
    entry: index.html
  design_system:
    requires: true
    sections: [color, typography, layout, components]
  craft:
    requires: [state-coverage, accessibility-baseline, laws-of-ux]
---

<!-- fixture：真机形态摘录（OpenDesign.app 安装版 2.0.4 design-templates/dashboard/SKILL.md，2026-11-10 实读）。
     frontmatter 逐字保留（全字段形态：name / 多行块 description / triggers 含中文项 / od.mode / od.craft.requires 单行 flow），
     正文仅摘头部数行（摘要扫描只读 frontmatter，正文行数不影响断言）；注释置于正文——真机文件首行即 frontmatter 界符。 -->

# Dashboard Skill

Produce a single-screen admin / analytics dashboard.

## Workflow

1. **Read the active DESIGN.md** (injected above). Colors, typography, spacing,
   component styling all come from it. Do not invent new tokens.
