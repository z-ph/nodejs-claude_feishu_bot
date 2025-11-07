/**
 * Claude AI 服务模块
 * 处理与 Claude API 的交互
 */

import Anthropic from '@anthropic-ai/sdk';
import { config } from 'dotenv';
import { THINKING_CONFIG } from '../config/deepThinkingConfig.js';

// 加载环境变量
config({ override: true });

// Claude API 配置
const ANTHROPIC_BASE_URL = process.env.ANTHROPIC_BASE_URL;
const ANTHROPIC_AUTH_TOKEN = process.env.ANTHROPIC_AUTH_TOKEN;

// AI 深度思考模式���置
const ENABLE_DEEP_THINKING = process.env.ENABLE_DEEP_THINKING === 'true';
const DEEP_THINKING_MAX_TOKENS = parseInt(process.env.DEEP_THINKING_MAX_TOKENS) || 64000; // 增加到64K，确保复杂数学问题完整解答

// 初始化 Claude 客户端
const claudeClient = new Anthropic({
  apiKey: ANTHROPIC_AUTH_TOKEN,
  baseURL: ANTHROPIC_BASE_URL,
});

/**
 * 调用 Claude API 获取回复（基础版本）
 * @param {string} message - 用户消息
 * @returns {Promise<string>} Claude 的回复
 */
async function getClaudeResponse(message) {
  try {
    const response = await claudeClient.messages.create({
      model: 'claude-sonnet-4-5-20250929',
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
 * 调用 Claude API 获取回复（深度思考模式 - 流式传输）
 * @param {string} message - 用户消息
 * @param {Function} onThinkingStart - 思考开始回调函数
 * @param {Function} onChunkReady - 流式内容块回调函数
 * @returns {Promise<string>} Claude 的回复
 */
async function getClaudeResponseWithThinking(message, onThinkingStart = null, onChunkReady = null) {
  try {
    console.log('🧠 启动AI深度思考流式模式...');

    // 通知开始思考
    if (onThinkingStart) {
      onThinkingStart();
    }

    // 构建系统提示词作为用户消息的一部分
    const systemPrompt = `${THINKING_CONFIG.SYSTEM_PROMPT}

${THINKING_CONFIG.USER_MESSAGE_TEMPLATE.replace('{message}', message)}`;

    // 使用流式响应
    const stream = await claudeClient.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: DEEP_THINKING_MAX_TOKENS,
      messages: [
        { role: 'user', content: systemPrompt }
      ],
      stream: true,
    });

    let fullResponse = '';
    let currentChunk = '';
    let totalTokens = 0;
    let lastUpdateTime = 0;
    const UPDATE_INTERVAL = 1000; // 每1秒更新一次

    console.log('📡 开始接收真正的流式响应...');

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.text) {
        const text = chunk.delta.text;
        fullResponse += text;
        currentChunk += text;
        const currentTime = Date.now();

        // 定期实时发送内容块（避免过于频繁的更新）
        if (onChunkReady && currentTime - lastUpdateTime >= UPDATE_INTERVAL) {
          onChunkReady(text, currentChunk, fullResponse);
          lastUpdateTime = currentTime;
        }

        // 检查是否接近飞书安全限制（只在接近时停止）
        if (currentChunk.length >= 45000) { // 45K字符，留5K安全边量
          console.warn(`⚠️ 接近飞书文本限制: ${currentChunk.length} 字符，停止接收`);
          break;
        }
      } else if (chunk.type === 'message_delta' && chunk.usage) {
        totalTokens = chunk.usage.output_tokens || 0;
        console.log(`📊 实时token使用: ${totalTokens}`);
      }
    }

    // 统计最终响应信息
    console.log(`📊 流式响应统计:`);
    console.log(`   - 响应长度: ${fullResponse.length} 字符`);
    console.log(`   - 最大token: ${DEEP_THINKING_MAX_TOKENS}`);
    console.log(`   - 实际token: ${totalTokens}`);
    console.log(`   - 字节数: ${Buffer.byteLength(fullResponse, 'utf8')} bytes`);

    // 检查响应是否被截断
    const isLikelyTruncated = totalTokens >= DEEP_THINKING_MAX_TOKENS * 0.95;
    if (isLikelyTruncated) {
      console.warn(`⚠️ 流式响应可能被截断: ${totalTokens}/${DEEP_THINKING_MAX_TOKENS} tokens`);
    }

    // 提取最终回答内容（去掉思考标记）
    let finalAnswer = fullResponse;
    if (fullResponse.includes('【思考中】')) {
      // 去掉【思考中】标记，保留实际的思考和分析内容
      const afterThinking = fullResponse.replace(/【思考中】\s*/, '');
      if (afterThinking.trim()) {
        finalAnswer = afterThinking.trim();
        console.log(`   - 思考内容长度: ${finalAnswer.length} 字符`);
      }
    } else if (fullResponse.includes('【答案】')) {
      // 如果有答案标记，提取答案部分
      const answerMatch = fullResponse.match(/【答案】([\s\S]*)/);
      if (answerMatch) {
        finalAnswer = answerMatch[1].trim();
        console.log(`   - 答案长度: ${finalAnswer.length} 字符`);
      }
    }

    // 检查是否需要重试（响应被截断且不完整）
    if (isLikelyTruncated && isResponseIncomplete(finalAnswer)) {
      console.log('🔄 流式响应检测到不完整，尝试重试获取完整内容...');
      return await handleTruncatedResponse(message, finalAnswer, totalTokens);
    }

    console.log('✅ AI深度思考流式模式完成');
    return finalAnswer || fullResponse;

  } catch (error) {
    console.error('Claude API 流式模式调用失败:', error);
    // 降级到基础模式
    console.log('🔄 降级到基础模式...');
    return getClaudeResponse(message);
  }
}

/**
 * 检查响应是否不完整（针对数学问题优化）
 * @param {string} response - 响应内容
 * @returns {boolean} 是否不完整
 */
function isResponseIncomplete(response) {
  if (!response || response.length < 100) return true; // 数学问题通常需要较长回答

  const trimmed = response.trim();

  // 检查明显的数学截断模式
  const mathTruncationPatterns = [
    /\w+[-=]\s*$/, // 数学表达式中间截断 (如 "作CE", "x =", "y = -")
    /[a-zA-Z]+\s*$/, // 以变量名结尾
    /\d+\s*$/, // 以数字结尾
    /[+\-*/(]\s*$/, // 以数学符号结尾
    /∠\s*$/, // 以角度符号结尾
    /cos\s*$/, /sin\s*$/, /tan\s*$/, // 三角函数不完整
    /作\s*$/, /设\s*$/, /令\s*$/, /求\s*$/, // 几何作图或求解动词
    /根据\s*$/, /由于\s*$/, /因为\s*$/, // 推理起始词
    /所以\s*$/, /因此\s*$/, /于是\s*$/, // 结论词但不完整
    /[，,]\s*$/, // 以逗号结尾
    /\.\.\.+\s*$/, // 省略号结尾
    /：\s*$/, // 冒号结尾但后面没有内容
    /$\s*$/, // 公式开始符号但没有结束
  ];

  const hasMathTruncation = mathTruncationPatterns.some(pattern => pattern.test(trimmed.slice(-50)));

  // 检查完整的句子结尾
  const completeEndings = [
    '。', '！', '？', '；', '。', '！', '？', '；',
    '」', ')', '】', '"', "'", ')', '}', ']'
  ];

  const lastChar = trimmed.slice(-1);
  const hasCompleteEnding = completeEndings.includes(lastChar);

  // 检查是否在数学推导中
  const inMathDerivation = trimmed.includes('推导') ||
                          trimmed.includes('计算') ||
                          trimmed.includes('求解') ||
                          trimmed.includes('证明') ||
                          trimmed.includes('因为') && !trimmed.includes('所以');

  // 检查是否包含未完成的数学结构
  const hasIncompleteMath =
    (trimmed.match(/\$/g) || []).length % 2 !== 0 || // 未配对的公式符号
    (trimmed.match(/```\s*$/m) || []).length > 0 || // 未关闭的代码块
    trimmed.includes('设') && !trimmed.includes('所以'); // 有假设但没有结论

  // 特殊检查：如果在几何作图步骤中截断
  const inGeometryConstruction =
    trimmed.includes('作') &&
    !trimmed.includes('则') &&
    !trimmed.includes('因此') &&
    !hasCompleteEnding;

  return hasMathTruncation || !hasCompleteEnding || hasIncompleteMath || inGeometryConstruction;
}

/**
 * 处理截断响应的重试逻辑
 * @param {string} originalMessage - 原始用户消息
 * @param {string} truncatedResponse - 截断的响应
 * @param {number} usedTokens - 已使用的token数
 * @returns {Promise<string>} 完整的响应
 */
async function handleTruncatedResponse(originalMessage, truncatedResponse, usedTokens) {
  console.log('🔧 开始处理截断响应重试...');

  // 构建继续提示
  const continuePrompt = `请继续完成你的回答，上一次的回答被截断了。之前的内容是：

${truncatedResponse}

请从中断的地方继续，完成完整的回答。`;

  try {
    // 使用剩余的token空间
    const remainingTokens = Math.max(1000, DEEP_THINKING_MAX_TOKENS - usedTokens);

    const response = await claudeClient.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: remainingTokens,
      messages: [
        {
          role: 'user',
          content: `${THINKING_CONFIG.SYSTEM_PROMPT}\n\n${THINKING_CONFIG.USER_MESSAGE_TEMPLATE.replace('{message}', continuePrompt)}`
        }
      ],
    });

    const continuation = response.content[0].text;
    console.log(`📊 重试响应统计:`);
    console.log(`   - 续写长度: ${continuation.length} 字符`);
    console.log(`   - 续写token: ${response.usage?.output_tokens || 'unknown'}`);

    // 合并响应
    const fullResponse = truncatedResponse + continuation;

    // 提取答案部分（如果合并后包含答案标记）
    let finalAnswer = fullResponse;
    if (fullResponse.includes('【答案】')) {
      const answerMatch = fullResponse.match(/【答案】([\s\S]*)/);
      if (answerMatch) {
        finalAnswer = answerMatch[1].trim();
      }
    } else if (truncatedResponse.includes('【答案】')) {
      // 如果原响应已有答案标记，只保留答案部分+续写
      const answerMatch = truncatedResponse.match(/【答案】([\s\S]*)/);
      if (answerMatch) {
        finalAnswer = answerMatch[1].trim() + continuation;
      }
    }

    console.log('✅ 截断响应重试完成');
    return finalAnswer || fullResponse;

  } catch (error) {
    console.error('❌ 截断响应重试失败:', error);
    console.log('🔄 返回原始截断响应');
    return truncatedResponse;
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
  getClaudeResponseWithThinking,
  isClaudeServiceAvailable,
  claudeClient,
  ENABLE_DEEP_THINKING,
  isResponseIncomplete,
  handleTruncatedResponse
};