/**
 * 事件队列模块
 * 处理异步事件队列，支持微任务处理
 */

import { getClaudeResponse } from '../services/claudeService.js';
import { getContextAsync } from '../services/contextService.js';
import { sendResponse } from '../services/messageService.js';

/**
 * 微任务队列系统
 */
class EventQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.errorCount = 0;
    this.maxErrors = 10; // 最大错误次数
  }

  /**
   * 添加事件到队列
   * @param {object} eventData - 事件数据
   */
  add(eventData) {
    this.queue.push(eventData);
    console.log(`📋 事件已加入队列，队列长度: ${this.queue.length}`);
    this.processQueue();
  }

  /**
   * 处理队列中的事件
   */
  async processQueue() {
    if (this.processing) {
      return;
    }

    this.processing = true;
    console.log('🔄 开始处理事件队列...');

    while (this.queue.length > 0) {
      const eventData = this.queue.shift();
      try {
        await this.processEvent(eventData);
        this.errorCount = 0; // 成功处理，重置错误计数
      } catch (error) {
        console.error('❌ 队列事件处理失败:', error);
        this.errorCount++;

        // 错误次数过多时，暂停处理
        if (this.errorCount >= this.maxErrors) {
          console.error(`❌ 队列错误次数过多 (${this.errorCount})，暂停处理30秒`);
          setTimeout(() => {
            this.errorCount = 0;
            this.processQueue();
          }, 30000);
          break;
        }
      }
    }

    this.processing = false;
    console.log('✅ 事件队列处理完成');
  }

  /**
   * 异步处理单个事件
   * @param {object} eventData - 事件数据
   */
  async processEvent(eventData) {
    const { data, eventType, userMessage, thread_id } = eventData;
    console.log(`🔄 异步处理事件: ${eventType}`);

    try {
      // 如果有thread_id，异步获取上下文
      let contextInfo = '';
      if (thread_id) {
        try {
          contextInfo = await getContextAsync(thread_id);
        } catch (error) {
          console.warn('⚠️ 队列中获取上下文失败:', error.message);
          contextInfo = '';
        }
      }

      // 调用 Claude API 获取智能回复
      const fullMessage = contextInfo ? `${contextInfo}当前用户消息: ${userMessage}` : userMessage;
      const claudeResponse = await getClaudeResponse(fullMessage);

      // 创建格式化的富文本消息
      let formattedResponse = `🤖 **Claude 智能回复**\n\n${claudeResponse}\n\n---\n💭 原始消息: ${userMessage}`;

      if (claudeResponse.length > 200) {
        formattedResponse = `🤖 **Claude 智能回复**\n\n${claudeResponse.substring(0, 200)}...\n\n${claudeResponse.substring(200, 400)}...\n\n*（回复较长，请分段阅读）*\n\n---\n💭 原始消息: ${userMessage}`;
      }

      // 发送回复（异步，失败不影响HTTP响应）
      await this.sendResponseAsync(data, claudeResponse, formattedResponse, userMessage);

    } catch (error) {
      console.error('❌ 异步事件处理失败:', error);
      // 发送错误响应
      try {
        await sendResponse(data, JSON.stringify({
          text: '抱歉，AI 服务暂时不可用，请稍后重试。'
        }), 'text');
      } catch (responseError) {
        console.error('错误响应发送失败:', responseError);
      }
    }
  }

  /**
   * 异步发送响应
   * @param {object} data - 事件数据
   * @param {string} claudeResponse - Claude回复
   * @param {string} formattedResponse - 格式化回复
   * @param {string} userMessage - 用户消息
   */
  async sendResponseAsync(data, claudeResponse, formattedResponse, userMessage) {
    const shouldCreateCard = claudeResponse.length > 100 || userMessage.includes('创建') || userMessage.includes('话题');

    try {
      if (shouldCreateCard) {
        const cardContent = {
          config: { wide_screen_mode: true },
          elements: [
            {
              tag: 'div',
              text: {
                content: `🤖 **Claude 智能回复**\n\n${claudeResponse}\n\n---\n💭 原始消息: ${userMessage}`,
                tag: 'lark_md'
              }
            },
            {
              tag: 'action',
              text: { content: '💬 继续对话', tag: 'plain_text' },
              type: 'primary',
              url: {
                android: 'https://claude.ai',
                ios: 'https://claude.ai',
                pc: 'https://claude.ai'
              }
            }
          ]
        };

        await sendResponse(data, JSON.stringify(cardContent), 'interactive');
      } else {
        const richTextContent = { text: formattedResponse };
        await sendResponse(data, JSON.stringify(richTextContent));
      }
    } catch (error) {
      console.error('发送回复失败:', error);
      // 尝试发送简单文本回复作为备份
      try {
        await sendResponse(data, JSON.stringify({ text: claudeResponse }), 'text');
        console.log('备份回复发送成功');
      } catch (backupError) {
        console.error('备份回复也失败:', backupError);
      }
    }
  }

  /**
   * 获取队列状态
   * @returns {object} 队列状态信息
   */
  getStatus() {
    return {
      queueLength: this.queue.length,
      processing: this.processing,
      errorCount: this.errorCount
    };
  }
}

// 创建全局事件队列实例
const eventQueue = new EventQueue();

export {
  EventQueue,
  eventQueue
};