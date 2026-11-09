# changesets

- 开发期：改动涉及已发布包的行为 / 功能时，执行 `pnpm changeset` 写一条变更集（选择包与 semver 类型），生成的 `.changeset/*.md` 随改动一起提交。
- 发版：本地执行 `pnpm changeset version`——消费全部待发变更集，bump 对应包版本并生成 / 更新各包 `CHANGELOG.md`，检查 diff 后提交；随后按仓库 `README.md`「发布」节触发 CI 发布。本机一律不执行 `changeset publish`。
- 未来新增**不发布 npm** 的内部包时：包保持 `private: true`，并把包名加进 `config.json` 的 `ignore` 清单（避免被变更集 bump 出无意义的版本号）；要发布的新包则不设 private，即自动纳入版本管理与发布范围。
