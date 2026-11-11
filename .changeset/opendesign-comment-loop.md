---
"opendesign-design-mode": minor
---

设计面板新增评论回路：评论侧栏（对当前产物发评论 / 线程内追加 / resolve 重开 / 失败态重试投递 / 四值投递徽标 / 损坏数据错误态）；评论数据落会话工作目录 `.od-comments/comments.json`（lock + 原子写，损坏读侧报错不重建）；评论作为独立来源消息（`source.kind='opendesign-design-mode/comment'`）回注当前会话，模型读产物源码改稿；写通道经宿主 connection.fetch 注册五条 `/api/opendesign-design-mode.comments` 路由（宿主 /api 共享鉴权层覆盖，落点双层包含校验）；`/opendesign-doctor` 扩为十二节，新增第⑫节评论环（线程计数 / 投递状态分布 / parse 健康度与恢复动作 / 路由族声明）；质量环监听排除 `.od-comments/`，两环互不误触。
