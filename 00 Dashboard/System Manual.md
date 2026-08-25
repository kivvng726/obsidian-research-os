# 系统手册与属性字典

## 设计规则

- 文件夹表达对象类型或生命周期。
- Properties 表达结构化状态。
- 内部链接表达知识关系。
- 标签只用于少量跨对象提醒，不承担主题分类。

## 核心对象

| type | 文件夹 | 作用 |
|---|---|---|
| project | 02 Projects | 管理一个研究成果或长期课题 |
| literature | 03 Literature | 管理一篇论文、书籍或报告 |
| evidence | 04 Notes/Evidence | 保存一个可追溯的证据命题 |
| concept | 04 Notes/Concepts | 跨文献维护概念定义与关系 |
| method | 04 Notes/Methods | 积累研究方法知识 |
| debate | 04 Notes/Debates | 综合相互冲突的研究结论 |
| synthesis | 04 Notes/Synthesis | 形成跨文献综合判断 |
| research-question | 05 Research/Questions | 围绕问题组织证据与答案 |
| writing-section | 06 Writing | 管理论文章节和证据缺口 |
| research-log | 08 Logs | 记录每日、每周研究推进 |

## 通用字段

| 属性 | 类型 | 说明 |
|---|---|---|
| type | Text | 对象类型，不随意创造近义值 |
| status | Text | 生命周期状态 |
| project | List | 所属项目，使用内部链接 |
| created | Date | 创建日期 |
| updated | Date | 人工重要更新日期 |
| tags | Tags | 只用于提醒，如 `attention`、`core` |

## 文献评分

统一使用 1–5 分：

- relevance：与当前研究的相关性
- quality：研究质量与可信度
- priority：当前处理优先级
- difficulty：阅读难度
- reading_progress：0–100 的阅读百分比

## 证据纪律

每条正式用于写作的证据都应至少具备：

- `source`
- `page`
- `research_questions`
- `direction`
- `strength`
- 对“这项证据不能证明什么”的说明

## 文件命名

- 文献：`作者 - 年份 - 短标题`
- 研究问题：`RQ-001 问题短名`
- 证据：`EV-001 证据命题短名`
- 综合笔记：`SYN 主题短名`
- 写作章节：`CH-2.1 章节名称`
