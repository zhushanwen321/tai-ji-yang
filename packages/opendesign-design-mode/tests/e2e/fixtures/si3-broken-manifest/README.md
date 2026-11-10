# si3-broken-manifest/ ——「已装但探测失败」形态说明

**形态**：资源根指向一个存在但清单损坏的目录——目录与 `open-design.json` 文件都在
（模拟 OD 已安装），但清单是截断的非法 JSON，任何解析 attempt 必然失败。

**用途**（信号-蕴涵表 V1·SI3，设计 §2.6）：插件启动探测失败有两种成因——真未安装 vs
已装但探测瞬时失败（慢挂载/权限/IO 异常）。DSH 的 activation 失败拒挂载且不自愈、
恢复靠重启，因此诊断文案必须区分两种形态：

| fixture | 资源根指向 | 预期诊断文案 |
|---------|-----------|--------------|
| `empty-assets/` | 空目录（无任何清单） | 「未检测到 OpenDesign」+ 安装指引 |
| `si3-broken-manifest/` | 本目录（清单存在但损坏） | 「检测失败请重启 DSH 重试」类文案（不得误报未安装） |

**用法**：e2e 把资源根环境变量指向本目录（其余同 V1·V5 隔离环境），断言 preset broken
且文案含重启重试指引（V1·U8 场景；V1 实施计划 V1·U8 行「已装但启动探测失败的假阳性形态」）。

**禁止修复本目录的 open-design.json**——损坏即其功能；来源与真清单的对账见
`tests/fixtures/mini-od/.../open-design.json` 的 `$fixtureSource`。
