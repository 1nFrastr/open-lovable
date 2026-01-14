# Open Lovable 模板系统需求文档

## 项目背景

将 Open Lovable 首页对话逻辑从基于 Firecrawl 的网站爬虫机制改为基于模板的项目创建系统，参考 bolt.diy 的实现方式。

## 核心需求

### 1. 跳过 Firecrawl 爬虫机制

**当前状态：**
- 用户输入 URL 或搜索词
- 使用 Firecrawl 爬取网站内容
- 基于爬取的内容生成代码

**目标状态：**
- 用户描述想要构建什么
- AI 识别意图并选择合适的模板
- 从 GitHub 下载模板代码
- 直接开始项目开发

### 2. 实现模板机制（参考 bolt.diy）

#### 2.1 意图识别
- 用户输入项目描述（如"创建一个todo应用"）
- 使用 LLM（OpenAI API）分析用户意图
- 推荐最合适的启动模板
- 返回模板名称和建议的项目标题

#### 2.2 模板下载
- 支持从 GitHub 仓库下载模板文件
- 使用 GitHub API 获取完整的仓库文件树
- 过滤不需要的文件（.git, .bolt 等）
- 返回所有文件的路径和内容

#### 2.3 项目创建
- 将下载的模板文件同步到 e2b 沙箱环境
- 使用 Open Lovable 的文件格式（`<file path="...">content</file>`）
- 不使用 bolt.diy 的格式（`<boltArtifact>`, `<boltAction>`）
- 初始化项目结构并准备好供 AI 继续开发

### 3. 环境限制

**只考虑本地开发环境：**
- 不需要适配 Cloudflare Workers 环境
- 不需要考虑边缘计算限制

## 技术实现要求

### 1. 文件结构

```
open-lovable/
├── types/
│   └── template.ts                      # 模板类型定义
├── config/
│   └── templates.ts                     # 可用模板配置
├── lib/
│   └── template-project.ts              # 模板工具函数
├── app/
│   ├── page.tsx                         # 首页（简化UI）
│   ├── generation/page.tsx              # 生成页面（添加模板支持）
│   └── api/
│       ├── detect-intent/route.ts       # 意图识别API
│       └── download-template/route.ts   # 模板下载API
└── docs/
    ├── TEMPLATE_SYSTEM.md               # 系统文档
    └── REQUIREMENTS.md                  # 本需求文档
```

### 2. API 设计

#### 2.1 意图识别 API
```typescript
// POST /api/detect-intent
Request: {
  message: string;      // 用户描述
  model?: string;       // AI 模型
}

Response: {
  template: string;     // 模板名称
  title: string;        // 项目标题
  error?: string;       // 错误信息
}
```

#### 2.2 模板下载 API
```typescript
// GET /api/download-template?repo=user/repo
Response: Array<{
  name: string;         // 文件名
  path: string;         // 文件路径
  content: string;      // 文件内容
}>
```

### 3. 模板配置格式

```typescript
interface Template {
  name: string;           // 唯一标识符（如 'react-vite'）
  label: string;          // 显示名称（如 'React + Vite'）
  description: string;    // 详细描述（供 AI 匹配）
  githubRepo: string;     // GitHub 仓库（如 'user/repo'）
  tags?: string[];        // 标签（如 ['react', 'vite', 'spa']）
  icon?: string;          // 图标（emoji）
}
```

### 4. Open Lovable 特定格式

**文件格式：**
```xml
<file path="src/App.tsx">
// 文件内容
</file>

<file path="package.json">
{
  "name": "project"
}
</file>
```

**说明消息：**
```xml
<explanation>
项目说明文字
</explanation>
```

**不使用的格式（bolt.diy 专用）：**
```xml
<!-- 不要使用这些格式 -->
<boltArtifact>...</boltArtifact>
<boltAction type="file">...</boltAction>
```

### 5. 工作流程

```
用户输入
    ↓
调用 /api/detect-intent
    ↓
存储到 sessionStorage:
  - projectPrompt
  - selectedTemplate
  - projectTitle
  - templateMode: 'true'
    ↓
导航到 /generation
    ↓
检测 templateMode 标志
    ↓
创建沙箱环境
    ↓
调用 downloadTemplateFiles()
    ↓
格式化为 Open Lovable 格式
    ↓
调用 /api/apply-ai-code
    ↓
文件同步到 e2b 沙箱
    ↓
项目就绪，用户可与 AI 交互
```

## 关键约束

### 1. 格式兼容性
- ✅ 必须使用 Open Lovable 的 `<file path="...">` 格式
- ❌ 不能使用 bolt.diy 的 `<boltArtifact>` 格式
- ✅ 需要适配 `/api/apply-ai-code` API 的参数格式

### 2. API 依赖
```javascript
// apply-ai-code API 接收参数
{
  response: string,     // 包含 <file> 标签的字符串
  isEdit: boolean,      // 是否是编辑模式
  packages?: string[]   // 可选的包列表
}

// 不需要传递（使用全局状态）：
// - sandboxId
// - conversationContext
```

### 3. 向后兼容
- 保留原有的 URL 克隆功能（legacy 模式）
- 两种模式可以共存
- 通过 sessionStorage 标志区分模式

## 预期模板列表

初始支持的模板：

1. **React + Vite** - 快速 React 开发
2. **Next.js App Router** - 全栈 React 应用
3. **Vue.js** - Vue 3 SPA 应用
4. **Astro** - 静态站点生成
5. **Remix** - 全栈 Web 框架
6. **Vanilla + Vite** - 原生 JavaScript
7. **Blank Project** - 空白项目（用于简单脚本）

## 环境变量

```env
# 必需 - 用于意图识别
OPENAI_API_KEY=sk-...

# 可选 - 提高 GitHub API 速率限制
GITHUB_TOKEN=ghp_...
# 或
GITHUB_ACCESS_TOKEN=ghp_...

# GitHub API 限制：
# 无 token: 60 次/小时
# 有 token: 5000 次/小时
```

## 测试要点

### 功能测试

1. **首页交互**
   - [ ] 首页加载正常
   - [ ] 模板卡片显示正确
   - [ ] 输入框功能正常
   - [ ] 点击模板预填充输入

2. **意图识别**
   - [ ] 输入 "创建 todo 应用" → 选择 react-vite
   - [ ] 输入 "构建博客" → 选择 astro
   - [ ] 输入 "全栈应用" → 选择 nextjs
   - [ ] API 失败时回退到默认模板

3. **模板下载**
   - [ ] 成功从 GitHub 下载文件
   - [ ] 正确过滤 .git 文件
   - [ ] 处理大文件限制（100KB）
   - [ ] 保留 lock 文件

4. **文件同步**
   - [ ] 文件正确同步到 e2b 沙箱
   - [ ] 使用正确的 Open Lovable 格式
   - [ ] 文件结构显示正确
   - [ ] 可以在沙箱中查看文件

5. **AI 交互**
   - [ ] 初始化消息显示正确
   - [ ] 可以与 AI 继续对话
   - [ ] AI 理解项目上下文
   - [ ] 可以修改模板文件

### 性能测试

1. **速度**
   - 意图识别 < 2秒
   - 模板下载 < 5秒（小型模板）
   - 文件同步 < 3秒
   - 总流程 < 10秒

2. **容错**
   - OpenAI API 失败 → 使用默认模板
   - GitHub API 失败 → 显示错误消息
   - 文件同步失败 → 允许从头开始构建

## 已知问题和优化方向

### 当前限制

1. **模板缓存**
   - 每次都重新下载模板
   - 建议：添加 IndexedDB 缓存

2. **大文件处理**
   - 非锁文件限制 100KB
   - 可能需要分批下载

3. **网络依赖**
   - 依赖 GitHub API 可用性
   - 建议：添加本地备份模板

### 未来优化

1. **用户体验**
   - 模板实时预览
   - 自定义模板支持
   - 模板搜索/过滤
   - 社区模板市场

2. **性能优化**
   - 本地模板缓存
   - 增量更新
   - 并行下载优化

3. **功能扩展**
   - 混合模式（模板 + URL 样式）
   - 模板版本管理
   - 模板组合（多模板混合）

## 参考资料

### bolt.diy 参考

**查看的文件：**
- `app/utils/selectStarterTemplate.ts` - 模板选择逻辑
- `app/routes/api.github-template.ts` - GitHub 下载实现
- `app/types/template.ts` - 模板类型定义
- `app/utils/constants.ts` - 模板配置列表

**关键学习点：**
1. 使用 LLM 进行意图识别
2. 从 GitHub API 批量下载文件
3. 模板配置的结构设计
4. 与 AI 对话的集成方式

**不适用的部分：**
- `<boltArtifact>` 和 `<boltAction>` 格式（bolt.diy 专用）
- Cloudflare Workers 环境适配
- Remix 框架特定的路由处理

### Open Lovable 参考

**关键文件：**
- `app/api/apply-ai-code/route.ts` - 文件应用逻辑
- `app/api/generate-ai-code-stream/route.ts` - AI 代码生成
- `lib/morph-fast-apply.ts` - 文件编辑工具

**文件格式：**
```xml
<file path="...">content</file>
<command>npm install</command>
<package>react</package>
<explanation>说明</explanation>
```

## 成功标准

### 必须达到：

1. ✅ 用户可以通过描述创建项目
2. ✅ AI 正确识别意图并选择模板
3. ✅ 模板文件成功下载并同步到沙箱
4. ✅ 文件使用正确的 Open Lovable 格式
5. ✅ 用户可以在生成的项目基础上继续开发
6. ✅ 保持与原有 URL 克隆功能的兼容性

### 期望达到：

1. ⭐ 整个流程在 10 秒内完成
2. ⭐ 用户体验流畅无卡顿
3. ⭐ 错误处理友好，有明确提示
4. ⭐ 代码质量高，易于维护和扩展


## 下一步行动

### 立即测试：

1. 启动开发服务器：`npm run dev`
2. 访问 http://localhost:3000
3. 输入测试描述，如："创建一个 React todo 应用"
4. 观察控制台日志和网络请求
5. 验证文件是否正确同步到沙箱
6. 尝试与 AI 继续对话修改项目

### 调试重点：

1. 检查 `/api/detect-intent` 返回的模板是否正确
2. 检查 `/api/download-template` 是否成功下载文件
3. 检查 `/api/apply-ai-code` 是否正确解析 `<file>` 标签
4. 检查 e2b 沙箱中是否有对应的文件
5. 检查 AI 对话是否理解项目上下文

### 配置要求：

```bash
# 1. 确保环境变量配置正确
cp .env.example .env.local

# 2. 添加必需的 API keys
OPENAI_API_KEY=sk-...          # 必需
GITHUB_TOKEN=ghp_...           # 可选但推荐

# 3. 重启开发服务器
npm run dev
```

---

**文档版本：** 1.0  
**最后更新：** 2026-01-14  
**状态：** 实施完成，待测试验证
