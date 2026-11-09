# Accessibility baseline craft rules

<!-- e2e fixture：rich-assets craft 手册（与 design-templates/dashboard/SKILL.md 的
     od.craft.requires 三册清单对齐；内容为最小占位正文，e2e 只断言指路与册数，不断言手册内文） -->

Every deliverable must render and operate accessibly:

1. Text contrast at least 4.5:1 against its background (3:1 for large type).
2. Every interactive element reachable by keyboard in DOM order, with a
   visible focus indicator.
3. Heading hierarchy starts at one `h1` and never skips a level.
4. Images that carry information carry `alt` text; decorative images are
   `alt=""`.
5. Hit targets are at least 24×24 CSS pixels.
