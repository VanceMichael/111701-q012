# 建筑材料报价采集服务

这是一个用于建筑材料报价的本地数据采集与归档服务。当前版本从仓库自带的合成来源记录读取一页数据，经过字段规整后写入进程内目录；来源内容和规整后的记录保留独立边界，便于在不访问外部系统的情况下复现采集过程。

## 运行

需要 Node.js 20 或更高版本，不需要安装第三方依赖。

```sh
npm test
npm run build
node src/pipeline.mjs
```

测试使用项目内的合成记录；执行不需要网络、凭据或外部服务。

## 报价比较

同一批材料可能同时收到多家供应商的报价：一家按箱、另一家按单件，还可能有供应商推荐相近而非完全相同的规格。`src/compare.mjs` 把归档后的报价按“材料 + 要求规格”分组比较，遵守以下规则，不会把这些差异压成一个最低价：

- **来源规格分清**：每条可比结果同时保留采购要求规格（requestedSpec）和供应商所报规格（quotedSpec），互不覆盖。
- **包装换算留痕**：按 packSize 把箱报价折算成基本单位单价（unitPrice），原报价单位、每单位数量和原价一并保留在 quoted 中。
- **替代建议单列**：所报规格与要求规格不一致的报价进入 substitutes，与规格完全一致的 exact 分别排序，不混排。
- **过期退出**：validUntil 早于比较日期的报价不参与 exact 或 substitutes，只在 expired 中留痕；未填 validUntil 视为长期有效。

```sh
npm run compare                                   # 比较仓库自带的两个供应商报价页
node src/compare.mjs --as-of=2026-11-18           # 指定比较日期（缺省为当天）
node src/compare.mjs 路径/报价页.json              # 比较自定义报价页
```

报价页与来源页同构（source + items），每个报价条目字段：

| 字段 | 含义 |
| --- | --- |
| id | 报价标识（同一来源内唯一，按 revision 更新） |
| material | 材料名称（采购标的） |
| requestedSpec | 采购要求规格 |
| quotedSpec | 供应商所报规格；与要求规格不一致即视为替代建议 |
| unit | 报价单位（如 箱、件） |
| packSize | 每个报价单位含多少基本单位，缺省 1 |
| baseUnit | 基本单位名称，缺省 件 |
| price | 每个报价单位的价格，正数 |
| validUntil | 报价有效期至（YYYY-MM-DD），缺省长期有效 |
| note | 供应商备注（如替代说明），可选 |
