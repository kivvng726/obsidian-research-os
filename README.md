# Research OS for Obsidian

Research OS 是一套运行在 Obsidian 内的个人论文研究工作台。它保留 Obsidian 原生文件、链接与编辑能力，在此基础上把论文导入、阅读材料、AI 分析、跨论文综合和视觉皮肤集中到一个更直观的界面中。

> 当前为 `0.4.0` 开源预览版。请先在测试 Vault 中使用，并自行备份重要资料。

## 核心功能

### AI 管理的文献库

- 将 PDF 拖入页面后创建文献记录，并在本地提取正文。
- 使用可配置的 AI 模型补全标题、作者、年份、会议/期刊、摘要和研究主题。
- 采用全库语义聚类，而不是按每篇论文标题分别创建类别。
- 按收件箱、待读、阅读中和已完成管理状态。
- 支持搜索、编辑元数据和安全删除；删除操作进入系统回收站。

### 阅读工作区

- 将原文 PDF、PPT/演示文稿和多份 Markdown 资料归入同一篇论文。
- 每篇论文拥有独立资料夹，可保存主阅读笔记、学习过程、与其他 AI 的讨论、实验记录等多份 Markdown。
- 支持拖入多份 Markdown；AI 分析时会综合资料夹内的笔记。
- 可配合 PDF++ 或 Study PDF 使用 PDF 高亮、标注和分栏阅读。
- AI 模型根据 PDF 正文、标注和笔记生成十问式论文导读，并支持围绕单篇论文继续对话。

### 跨论文研究进展

- 选择 2–12 篇论文并填写研究目标，生成一份跨论文综合。
- 输出当前结论、共同认识、分歧、方法比较、研究空白和下一步建议。
- 结论保留来源论文映射，减少只有结论、没有证据的问题。
- 研究进展按主题组织，未进入综合的单篇提炼集中在待处理区。

### 论文发现与关系图谱

- 从 arXiv 获取大模型与 Agent 方向的新论文并给出推荐理由。
- 图谱展示论文与主题、作者、方法和概念之间的关系。
- 节点支持拖动、缩放和点击进入论文。

## 自适应视觉皮肤

视觉系统不是简单更换壁纸。用户选择背景后，插件在本地使用 Canvas 完成区域采样和颜色分析：

1. 分别分析侧栏、顶部栏和内容区的主色与亮度。
2. 过滤接近纯黑、纯白及透明像素等干扰。
3. 生成玻璃表面、悬停状态、边框、三级文字、强调色和图谱颜色。
4. 检查正文与控件的对比度，普通文字目标不低于 `4.5:1`。
5. 通过统一语义令牌应用到所有页面与组件。

用户可以调节背景遮罩、玻璃透明度、模糊、文字对比度和强调色强度。调整先进入临时预览，确认后才保存。

`forest-original` 是受保护的安全预设，自定义皮肤不会覆盖它。安装包内置项目作者原创的森林背景；用户也可以在插件设置中创建自定义动态皮肤。图片分析完全在本地完成。

## 安装

### 从 Release 安装

1. 下载最新发布页中的 `research-os.zip`。
2. 解压后得到 `research-os` 文件夹。
3. 将 `research-os` 文件夹移动到 Vault 的 `.obsidian/plugins/` 中。
4. 确认最终路径是 `.obsidian/plugins/research-os/manifest.json`。
5. `research-os` 文件夹内应直接包含 `main.js`、`manifest.json`、`styles.css` 和 `forest.jpg`。不要形成 `.obsidian/plugins/research-os/research-os/manifest.json` 这种双层目录。
6. 重启 Obsidian，或点击社区插件页面的刷新按钮，然后启用 **Research OS**。

### 从源码构建

需要 Node.js 18 或更高版本：

```bash
npm install
npm run check
npm test
npm run build
```

然后在 Obsidian 的社区插件设置中启用 **Research OS**。

## AI 配置与成本控制

在 `设置 → Research OS → AI 模型服务` 中选择服务商并填写自己的 API Key。AI 功能是可选的；未配置时仍可使用本地文献、阅读队列、笔记和主题功能。

当前内置以下 OpenAI-compatible Chat Completions 服务：

- DeepSeek：`https://api.deepseek.com`
- OpenAI / GPT：`https://api.openai.com/v1`
- Kimi / Moonshot：`https://api.moonshot.ai/v1`
- OpenRouter：`https://openrouter.ai/api/v1`
- 硅基流动 SiliconFlow：`https://api.siliconflow.cn/v1`
- 自定义 OpenAI 兼容接口：手动填写 Base URL 和模型名

其他服务如果支持 `/chat/completions`、Bearer API Key、`messages` 请求格式，并返回 `choices[0].message.content`，也可以通过“自定义 OpenAI 兼容接口”填写 Base URL 和模型名使用。不保证所有模型都兼容 JSON 输出、上下文长度和服务商私有参数。

分析优先使用摘要、用户笔记、PDF 高亮和相关正文片段，再按需要补充 PDF 正文，以降低费用并保留用户自己的理解。调用 AI 模型可能产生费用，请以服务商的实际价格与条款为准。

## 隐私与版权

- API Key、AI 对话和本地偏好保存在 `.obsidian/plugins/research-os/data.json`，该文件已被 Git 忽略。
- AI 功能会把必要的论文内容发送到用户配置的模型服务 API；背景取色不会上传图片。
- 默认忽略私人论文、PDF、PPT、阅读笔记、研究记录和自定义背景。
- 请勿未经许可公开论文全文、截图、字体或第三方图片。

完整说明见 [SECURITY.md](SECURITY.md) 与 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 项目结构

```text
.obsidian/plugins/research-os/
├── main.source.js       # 插件入口与命令注册
├── research-view.js     # 工作台页面与交互
├── research-store.js    # Vault 数据、PDF 导入与资料夹管理
├── literature-modal.js  # 文献编辑与自动识别
├── synthesis-modal.js   # 多论文选择与研究综合
├── ai-service.js        # AI 模型服务、语义分类与论文发现
├── paper-graph.js       # 论文关系图谱
├── theme-engine.js      # 本地图片分析与对比度计算
├── theme-service.js     # 主题状态、预览与安全回退
├── theme-settings.js    # 视觉皮肤设置
├── styles.css           # 组件与主题样式
└── manifest.json
```

仓库还包含可选的 Dashboard、Templates 和 Bases 示例。个人论文及研究内容不属于项目源码。

## 贡献与发布

欢迎提交 bug 修复、无障碍改进、文献工作流、PDF 解析、AI 分类和主题系统相关贡献。请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。

版本发布通过 `v*` Git 标签触发 GitHub Actions，自动执行检查、测试、构建并生成 Obsidian 插件安装包。

## 许可证

代码使用 [MIT License](LICENSE)。随插件提供的原创森林背景同样按 MIT License 分发；论文、用户数据、其他背景图片、字体和第三方服务不自动包含在此许可范围内。
