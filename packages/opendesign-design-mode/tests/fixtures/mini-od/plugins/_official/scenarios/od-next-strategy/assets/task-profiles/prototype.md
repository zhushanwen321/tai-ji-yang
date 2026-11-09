<!--
  fixture 摘录：OD 仓 plugins/_official/scenarios/od-next-strategy/assets/task-profiles/prototype.md
  （0.25.1 检出原文，摘录于 2026-11-09）。收录设备壳落点语义段（材质化四文件的消费契约）。
  本档属运行时模型自读资产（设计 D4/D6）：不经系统提示词注入、不经改写器，
  故收录范围以材质化断言（U5）与组装断言（U3 路由段路径）所需为限。
-->
# OD Next Prototype Task Profile（fixture 摘录）

（原文 L200-208：手持壳落点表——材质化副本以扁平形态落在项目目录 .od-frames/ 内，
 四文件名与清单 prototype.resources 声明一致）

… stages the shells at `.od-frames/` in the project directory and, when it
does, the mapping is:

| Platform cues | Shell |
| --- | --- |
| iPhone, iOS, SwiftUI, UIKit, App Store | `.od-frames/iphone.html` |
| Android, Material, Pixel, Galaxy, HarmonyOS, APK | `.od-frames/android.html` |
| A phone / mobile app with no platform named | `.od-frames/neutral.html` |

（原文 L247：layout.css 落点语义）

Open Design stages `.od-frames/layout.css` beside the handset shells and
product styles layer above it.

（原文 L447：既有壳复用禁令——材质化重铺「幂等不堆积」语义的资产侧来源）

For handheld prototypes, use the appropriate existing shell in .od-frames/
(iphone.html, android.html, neutral.html) and read .od-frames/layout.css for
layout primitives. Preserve existing artifacts and user-edited shells.
