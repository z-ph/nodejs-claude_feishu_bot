/**
 * 飞书 + Claude 聊天机器人 (模块化版本)
 *
 * 实现至少一次(at-least-once)事件传递策略：
 * 1. 立即返回HTTP 200响应，避免飞书重试
 * 2. 将业务逻辑放入异步队列处理
 * 3. 支持事件去重(event_id/uuid)
 * 4. 错误处理和重试机制
 */

import * as Lark from '@larksuiteoapi/node-sdk';
import { config } from 'dotenv';

// 加载环境变量
config({ override: true });

// 导入模块化组件
import { isDuplicateEvent } from './utils/eventDeduplicator.js';
import { eventQueue } from './utils/eventQueue.js';
import { detectEventTriggerType } from './utils/eventDetector.js';
import { isClaudeServiceAvailable } from './services/claudeService.js';
import { sendResponse } from './services/messageService.js';
import { wsClient } from './config/larkConfig.js';

// 环境变量检查
console.log('📋 环境变量检查:', {
  'ANTHROPIC_BASE_URL': process.env.ANTHROPIC_BASE_URL,
  'ANTHROPIC_AUTH_TOKEN': process.env.ANTHROPIC_AUTH_TOKEN ? '已设置' : '未设置',
  'APP_ID': process.env.APP_ID,
  'APP_NAME': process.env.APP_NAME,
  'BOT_OPEN_ID': process.env.BOT_OPEN_ID,
  'BOT_USER_ID': process.env.BOT_USER_ID
});

// 检查Claude服务可用性
if (!isClaudeServiceAvailable()) {
  throw new Error('请在 .env 文件中配置 ANTHROPIC_BASE_URL 和 ANTHROPIC_AUTH_TOKEN');
}

/**
 * 飞书事件处理器 - 实现at-least-once传递策略
 */
async function handleFeishuEvent(data) {
  console.log('\n' + '='.repeat(50));
  console.log('=== 收到飞书事件 ===');
  console.log('时间戳:', new Date().toISOString());

  try {
    // 第一步：事件去重检查（使用改进的去重机制）
    if (isDuplicateEvent(data)) {
      console.log('🔄 跳过重复事件，飞书不会重试');
      return; // 对于重复事件直接返回，HTTP 200会自动返回
    }

    // 第二步：快速检测是否需要处理此事件
    const eventType = detectEventTriggerType(data);
    console.log('=== 事件类型检测结果 ===');
    console.log('事件类型:', eventType);

    // 只有私聊和群聊@才处理，其他事件直接忽略
    const shouldProcess = ['private_message', 'group_mention'].includes(eventType);

    if (!shouldProcess) {
      console.log('🚫 普通群聊消息，直接忽略');
      return; // 直接返回，HTTP 200会自动返回
    }

    // 第三步：快速解析消息（同步操作，确保快速完成）
    const {
      message: { content, message_type, thread_id },
    } = data;

    let userMessage = '';
    let parseError = null;

    try {
      if (message_type === 'text') {
        userMessage = JSON.parse(content).text;
        console.log('✅ 快速解析文本消息成功:', userMessage);
      } else {
        parseError = '解析消息失败，请发送文本消息 \nparse message failed, please send text message';
        console.log('🚫 非文本消息类型:', message_type);
      }
    } catch (error) {
      parseError = '解析消息失败，请发送文本消息 \nparse message failed, please send text message';
      console.error('❌ 解析消息内容失败:', error);
    }

    // 如果解析失败，立即发送错误响应
    if (parseError) {
      try {
        await sendResponse(data, JSON.stringify({ text: parseError }), 'text');
        console.log('✅ 解析错误响应发送成功');
      } catch (responseError) {
        console.error('❌ 解析错误响应发送失败:', responseError);
      }
      return;
    }

    console.log(`📨 事件已记录，将异步处理: ${userMessage}`);

    // 第四步：将事件加入异步处理队列
    // 关键：此时事件处理已经完成，HTTP 200响应会立即返回
    eventQueue.add({
      data,
      eventType,
      userMessage,
      thread_id
    });

    console.log('✅ 事件已加入异步队列，HTTP 200响应即将返回');
    console.log('🔄 飞书不会重试，业务逻辑将异步处理');

  } catch (error) {
    console.error('❌ 事件处理流程发生错误:', error);
    console.error('错误堆栈:', error.stack);

    // 即使发生错误，也要尝试发送一个简单响应避免重试
    try {
      await sendResponse(data, JSON.stringify({
        text: '事件已收到，处理中...'
      }), 'text');
      console.log('✅ 错误情况下的保底响应发送成功');
    } catch (fallbackError) {
      console.error('❌ 连保底响应都失败:', fallbackError);
      console.log('⚠️ 飞书可能会重试');
    }
  }

  console.log('=== 事件处理函数结束 ===');
  console.log('='.repeat(50) + '\n');
}

/**
 * 注册事件处理器
 */
const eventDispatcher = new Lark.EventDispatcher({}).register({
  /**
   * 注册接收消息事件，处理接收到的消息
   * https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/im-v1/message/events/receive
   */
  'im.message.receive_v1': handleFeishuEvent,
});

/**
 * 启动长连接，并注册事件处理器
 */
console.log('🚀 启动飞书 + Claude 聊天机器人 (模块化版本)...');
console.log('📝 配置信息:');
console.log(`   - Claude Base URL: ${process.env.ANTHROPIC_BASE_URL}`);
console.log(`   - Claude Auth Token: ${process.env.ANTHROPIC_AUTH_TOKEN.substring(0, 20)}...`);
console.log('✅ 机器人已启动，等待消息...');
console.log('🔄 已启用 at-least-once 事件传递策略');

// 启动WebSocket连接
wsClient.start({ eventDispatcher });

// 优雅关闭处理
process.on('SIGINT', () => {
  console.log('\n🛑 收到关闭信号，正在优雅关闭...');
  console.log('📊 队列状态:', eventQueue.getStatus());
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 收到终止信号，正在优雅关闭...');
  console.log('📊 队列状态:', eventQueue.getStatus());
  process.exit(0);
});