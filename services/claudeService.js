/**
 * Claude AI 服务模块
 * 处理与 Claude API 的交互
 */

import Anthropic from '@anthropic-ai/sdk';
import { config } from 'dotenv';

// 加载环境变量
config({ override: true });

// Claude API 配置
const ANTHROPIC_BASE_URL = process.env.ANTHROPIC_BASE_URL;
const ANTHROPIC_AUTH_TOKEN = process.env.ANTHROPIC_AUTH_TOKEN;

// 初始化 Claude 客户端
const claudeClient = new Anthropic({
  apiKey: ANTHROPIC_AUTH_TOKEN,
  baseURL: ANTHROPIC_BASE_URL,
});

/**
 * 调用 Claude API 获取回复
 * @param {string} message - 用户消息
 * @returns {Promise<string>} Claude 的回复
 */
async function getClaudeResponse(message) {
  try {
    const response = await claudeClient.messages.create({
      model: 'GLM-4.6',
      max_tokens: 1000,
      messages: [
        { role: 'user', content: message }
      ]
    });
    return response.content[0].text;
  } catch (error) {
    console.error('Claude API 调用失败:', error);
    return `抱歉，AI 服务暂时不可用。原始消息: ${message}`;
  }
}

/**
 * 检查 Claude 服务是否可用
 * @returns {boolean} 服务是否可用
 */
function isClaudeServiceAvailable() {
  return !!(ANTHROPIC_BASE_URL && ANTHROPIC_AUTH_TOKEN);
}

export {
  getClaudeResponse,
  isClaudeServiceAvailable,
  claudeClient
};