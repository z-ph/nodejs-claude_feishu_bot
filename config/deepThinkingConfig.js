/**
 * 深度思考模式配置文件（简化版）
 * 集中管理深度思考模式相关的所有参数
 */

// 注意：编辑策略配置已简化，深度思考模式不再使用实时编辑
// 如需恢复实时编辑功能，请参考之前的 EDIT_CONFIG 配置

// 思考过程配置
export const THINKING_CONFIG = {
  // 时间控制
  MAX_THINKING_TIME: 30000, // 最大思考时间（毫秒）

  // 系统提���词
  SYSTEM_PROMPT: `你是一个具有深度思考能力的AI助手。在回答用户问题之前，请仔细分析问题，展示你的思考过程。

思考模式要求：
1. 首先理解问题的核心和背景
2. 分析问题的关键点和可能的解决方案
3. 逐步推理，展示思考链条
4. 考虑不同的角度和可能性
5. 最后给出经过深思熟虑的答案

请用【思考中】标记你的思考过程，用【答案】标记最终答案。`,

  // 用户消息模板
  USER_MESSAGE_TEMPLATE: `用户消息：{message}`,
};

// 消息模板配置（简化版）
export const MESSAGE_TEMPLATES = {
  // 思考开始提示（简化版）
  THINKING_START: '🧠 **AI 正在深度思考中...**\n\n⏳ 请稍候，正在分析问题并生成详细回复...',

  // 最终回复前缀
  DEEP_THINKING_PREFIX: '🧠 **AI 深度思考回复**',
  STANDARD_PREFIX: '🤖 **AI 智能回复**',

  // 最终回复后缀
  DEEP_THINKING_SUFFIX: '\n✨ *本回复由 AI 深度思考模式生成*',
  STANDARD_SUFFIX: '',

  // 注意：编辑相关模板已移除，因为不再使用实时编辑
};

// 错误处理配置（简化版）
export const ERROR_CONFIG = {
  // 飞书API错误代码
  EDIT_LIMIT_ERROR_CODE: 230072,

  // 降级策略
  FALLBACK_TO_STANDARD_MODE: true,
};

// 监控和日志配置（简化版）
export const MONITORING_CONFIG = {
  // 日志级别
  LOG_LEVEL: 'INFO', // DEBUG, INFO, WARN, ERROR
};

// 导出默认配置
export const DEFAULT_CONFIG = {
  THINKING_CONFIG,
  MESSAGE_TEMPLATES,
  ERROR_CONFIG,
  MONITORING_CONFIG,
};