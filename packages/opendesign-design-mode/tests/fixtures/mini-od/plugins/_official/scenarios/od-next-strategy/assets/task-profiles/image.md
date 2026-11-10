<!--
  fixture 摘录：OD 仓 .../assets/task-profiles/image.md（0.25.1 检出原文，2026-11-09）。
  媒体三档之一（排除五档，设计 V1·D6）：V1 不进路由白名单，注入文本不得含本档路径（V1·RL3）。
  fixture 使该排除断言非空洞（清单 context.assets 已声明本档、文件真实存在）。
  收录媒体管线命令段（原文 L5）——媒体命令族全部走 daemon 管线的形态样本。
-->
# OD Next Image Task Profile v3.1.1（fixture 摘录）

Generate images through the existing media CLI. First use `"$OD_NODE_BIN" "$OD_BIN"
media --help` and generate --help to discover models and current parameters; do
not guess model IDs. Use media generate --project "$OD_PROJECT_ID" --surface image
--model <available-model> --prompt <request> --output <planned-file>. Do not call
provider APIs directly or print credentials.
