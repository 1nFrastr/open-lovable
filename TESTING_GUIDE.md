# 测试指南：重构后的 generate-ai-code-stream API

## 快速开始

```bash
# 启动开发服务器
pnpm dev

# 访问应用
open http://localhost:3000
```

## 测试场景

### 1. 首次生成（无现有文件）

**测试步骤**:
1. 打开应用主页
2. 输入提示词: "Create a simple todo list app"
3. 点击生成

**预期结果**:
- ✅ 生成 App.tsx, index.css, 以及可能的组件文件
- ✅ 控制台显示 tool calling 日志
- ✅ 前端实时显示文件写入进度
- ✅ 无TypeScript或linter错误

### 2. 编辑现有应用

**测试步骤**:
1. 在已有应用基础上
2. 输入提示词: "Change the header background to blue"
3. 点击生成

**预期结果**:
- ✅ 只修改 Header.tsx (或包含header的文件)
- ✅ 其他文件保持不变
- ✅ 对话历史记录编辑操作

### 3. Tool Calling验证

**测试步骤**:
1. 输入: "Add a chart component using recharts"
2. 观察控制台和网络请求

**预期结果**:
- ✅ 先调用 installPackages(['recharts'])
- ✅ 然后调用 writeFile 创建组件
- ✅ 前端显示安装进度

### 4. Package自动检测

**测试步骤**:
1. 输入: "Add routing with react-router-dom"
2. 不手动指定packages

**预期结果**:
- ✅ 从 import 语句自动检测 react-router-dom
- ✅ packagesToInstall 包含该package
- ✅ 控制台显示 "Package detected from imports"

### 5. 截断恢复测试

**测试步骤**:
1. 输入非常复杂的请求: "Create a dashboard with 10 different chart types"
2. 可能触发代码截断

**预期结果**:
- ✅ 检测到截断文件
- ✅ 自动尝试补全
- ✅ 前端显示 "Completing..." 消息
- ✅ 最终生成完整代码

### 6. 对话历史测试

**测试步骤**:
1. 首次生成: "Create a landing page"
2. 再次编辑: "Add a hero section"
3. 第三次编辑: "Add hero section" (重复)

**预期结果**:
- ✅ 第三次不会重新创建hero组件
- ✅ 系统提示显示 "RECENTLY CREATED/EDITED FILES"
- ✅ 提醒AI更新现有文件而非重新创建

### 7. 不同模型测试

**测试模型**:
- openai/gpt-4
- anthropic/claude-3-opus
- google/gemini-pro
- groq/llama-3-70b

**预期结果**:
- ✅ OpenAI和Anthropic启用tool calling
- ✅ 其他模型正常生成（可能不支持tools）
- ✅ 所有模型都能正确处理响应

### 8. 错误处理测试

**测试场景**:
- API key无效
- 网络超时
- 服务503错误

**预期结果**:
- ✅ 显示友好的错误消息
- ✅ 自动重试（对于可重试错误）
- ✅ 不崩溃应用

## 性能验证

### 响应时间

```bash
# 首次token时间
# 预期: < 2秒

# 完整生成时间（简单应用）
# 预期: 10-30秒

# 工具调用延迟
# 预期: < 500ms
```

### 内存使用

```bash
# 监控Node.js内存
node --expose-gc --inspect

# 预期: 持续运行不泄漏内存
```

## 日志验证

### 关键日志点

检查控制台是否有以下日志：

```
[generate-ai-code-stream] Received request
[buildConversationContext] Building conversation context
[buildFullContext] Backend file cache status
[processAIStream] Tool call started: writeFile
[processAIStream] Streamed XXX chars
[recoverTruncatedFiles] Attempting to regenerate
[generate-ai-code-stream] Generation complete
```

## 调试技巧

### 1. 查看完整请求

```typescript
// route.ts 中添加
console.log('[DEBUG] Full request:', JSON.stringify({
  prompt,
  model,
  context,
  isEdit
}, null, 2));
```

### 2. 追踪Tool Calling

```typescript
// stream-processor.ts 中已有
// 查看 "Tool call started" 日志
```

### 3. 检查文件缓存

```typescript
console.log('[DEBUG] Backend cache:', 
  Object.keys(global.sandboxState?.fileCache?.files || {}));
```

## 常见问题排查

### 问题：生成的文件不完整

**检查**:
1. 是否触发了截断检测？
2. `enableTruncationRecovery` 是否启用？
3. 查看截断恢复日志

### 问题：Package未安装

**检查**:
1. Tool calling是否启用？（查看 `supportsTools` 日志）
2. Package检测器是否正常工作？
3. 查看 `extractPackagesFromFiles` 输出

### 问题：编辑时重新生成所有文件

**检查**:
1. `isEdit` 标志是否正确传递？
2. Backend cache是否有文件？
3. 对话历史是否包含最近文件？

### 问题：对话上下文过长

**检查**:
1. 消息数量是否超过20？（应自动清理）
2. 编辑记录是否超过10？（应自动清理）
3. 查看 `cleanupConversationState` 日志

## 回归测试清单

- [ ] 首次生成简单应用
- [ ] 编辑现有应用
- [ ] 安装新package
- [ ] 截断恢复
- [ ] 多次对话
- [ ] 不同模型
- [ ] 错误处理
- [ ] 性能指标

## 集成测试命令

```bash
# 类型检查
pnpm run typecheck

# Linting
pnpm run lint

# 构建测试
pnpm run build

# 启动生产服务器
pnpm run start
```

## 备注

- 所有模块已通过TypeScript类型检查
- 无linter警告
- 代码覆盖率：待添加单元测试
- 备份文件: `route.ts.backup`

---

**最后更新**: 2026-01-19
**重构版本**: v2.0
**状态**: ✅ 就绪测试
