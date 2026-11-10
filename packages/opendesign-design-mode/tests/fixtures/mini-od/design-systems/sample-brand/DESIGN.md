<!--
  fixture 小样本：OD 仓 design-systems/<name>/DESIGN.md 形态（打包源 = OD 仓根 design-systems/
  整树 → Resources/design-systems，tools/pack/src/resources/index.ts BUNDLED_RESOURCE_TREES
  核实，2026-11-09；样本结构参照 design-systems/apple/DESIGN.md 的章节骨架）。
  消费方：V1·U3 组装（设计系统目录清单扫描）、V1·U4 改写（设计系统读取命令路径化后模型直读的目标）。
-->
# Design System Sample Brand（fixture 样本）

> Category: Sample
> Fixture design system: minimal structure sample for direct-read tests.

## 1. Visual Theme & Atmosphere

A deliberately small sample: the real design systems carry multi-section
editorial descriptions. This fixture keeps only the heading skeleton so
path-resolution and catalog tests have a stable target.

## 2. Color Palette & Roles

- `--ds-accent`: the single accent used across surfaces.
- `--ds-bg` / `--ds-fg`: base surface and text pair.

## 3. Typography

One display family and one text family, scaled by the token sheet in `tokens.css`.
