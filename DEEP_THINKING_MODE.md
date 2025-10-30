# AI 深度思考模式说明

## 概述

本项目的AI聊天机器人现在支持深度思考模式，该模式让AI在回答问题之前会进行深入的分析和思考，为用户提供更高质量、更详细的回复。

## 功能特点

### 🧠 深度思考模式
- **思考过程可视化**: 用户可以看到AI的���考过程
- **逐步推理**: AI会展示分析问题、推理、得出结论的完整过程
- **高质量回复**: 经过深度思考的回复更加全面和准确
- **流式响应**: 支持实时显示思考过程和最终答案

### 🤖 标准模式
- **快速响应**: 直接给出答案，响应速度更快
- **简洁高效**: 适合简单问题和快速查询

## 配置方法

在 `.env` 文件中添加以下配置：

```bash
# AI 深度思考模式配置
ENABLE_DEEP_THINKING=true          # 启用深度思考模式
DEEP_THINKING_MAX_TOKENS=2000     # 深度思考模式的最大token数
```

### 配置说明

- `ENABLE_DEEP_THINKING`:
  - `true`: 启用深度思考模式
  - `false`: 使用标准模式（默认）

- `DEEP_THINKING_MAX_TOKENS`:
  - 深度思考模式使用的最大token数量
  - 建议设置为 1500-3000 以获得更好的思考效果
  - 默认值: 2000

## 使用体验对比

### 深度思考模式 (ENABLE_DEEP_THINKING=true)
1. 用户发送消息后，会立即收到 "🧠 AI 正在深度思考中..." 的提示
2. AI会展示其思考过程，包括问题分析、推理步骤等
3. 最终显示经过深思熟虑的答案，标记为 "🧠 AI 深度思考回复"

### 标准模式 (ENABLE_DEEP_THINKING=false)
1. 用户发送消息后，会收到 "🤖 AI 正在处理中..." 的提示
2. AI直接生成答案，不显示思考过程
3. 显示为 "🤖 AI 智能回复"

## 技术实现

### @anthropic-ai/sdk 集成

项目使用 Anthropic Claude SDK 实现AI对话功能：

```javascript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_AUTH_TOKEN,
  baseURL: process.env.ANTHROPIC_BASE_URL,
});
```

### 深度思考模式实现

```javascript
// 使用流式响应获取思考过程
const stream = await client.messages.create({
  model: 'GLM-4.6',
  max_tokens: DEEP_THINKING_MAX_TOKENS,
  messages: [
    {
      role: 'system',
      content: `你是一个具有深度思考能力的AI助手...`
    },
    { role: 'user', content: message }
  ],
  stream: true
});
```

## 切换模式

修改 `.env` 文件中的 `ENABLE_DEEP_THINKING` 配置后，需要重启机器人服务以应用新配置。

```bash
# 重启服务
npm start
```

## 注意事项

1. **响应时间**: 深度思考模式需要更多时间进行分析，响应时间会比标准模式长
2. **Token消耗**: 深度思考模式会消耗更多token，请确保API配额充足
3. **消息编辑**: 深度思考模式支持实时更新思考过程到消息中
4. **降级机制**: 如果深度思考模式失败，系统会自动降级到标准模式

## 推荐使用场景

### 深度思考模式适用于：
- 复杂问题分析
- 需要详细解释的场景
- 创意思考和头脑风暴
- 决策建议和方案规划

### 标准模式适用于：
- 简单问答
- 信息查询
- 快速对话
- 日常闲聊

---

*通过合理配置和使用，您可以根据不同场景选择最适合的AI回复模式。*