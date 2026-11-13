# tai-ji-yang main 包

DSH 插件「太极工作台」根包（双半场：Node 半场 `index.js` → `lib/index.js`；浏览器半场 `client/` → `lib/client.js`，React 由宿主供给）。本词表只收项目特有概念。

## Language

**视图模型**（view model）：client/settings/model-service/ 各视图文件内与组件同文件的纯 TS 快照类（ProvidersListModel / ModelsListModel / ProviderEditModel），subscribe/getSnapshot/notify 三件套，会话内权威。_Avoid_: 「store」（与 route-store 的域 store 混淆）。

**窄表单 / 全表单**：供应商编辑体按 target.narrow 的两形态——目录型只填密钥（端点/协议由目录解析），自定义型全字段。

**写入权威状态机**（RouteWriteAuthority）：路由表会话内写入权威的显式状态机——idle/authoritative/ceded 三态 + 9 事件转移表，内聚 revision 栅栏、覆写前值集合、收敛防抖与宽限锚；RoutesListModel 只做 IO 编排。_Avoid_: 回放守卫族（旧称，指散落的七个修饰字段）、route-store 守卫。

**Config 整字段读改写助手**（writeConfigFieldRMW）：无乐观 UI 状态的插件 Config 整字段写回唯一入口——栅栏防线（被拒/传输异常重读重算重发一次）+ 内容防线（verify 钩子校验关键成员、缺席以重读内容重发）。_Avoid_: RMW helper、attempt 重试。
