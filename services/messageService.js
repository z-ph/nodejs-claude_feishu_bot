/**
 * 消息服���模块
 * 处理飞书消息的发送逻辑
 */

import { client } from '../config/larkConfig.js';

/**
 * 发送回复消息的通用函数
 * @param {object} data - 事件数据
 * @param {string} content - 消息内容
 * @param {string} msgType - 消息类型，默认为 'text'
 * @returns {Promise<object>} 发送结果
 */
async function sendResponse(data, content, msgType = 'text') {
  const {
    message: { chat_id, chat_type, message_id, thread_id },
  } = data;

  console.log('=== 准备发送回复 ===');
  console.log('chat_type:', chat_type);
  console.log('thread_id:', thread_id);
  console.log('消息类型:', msgType);

  try {
    if (chat_type === 'p2p') {
      console.log('=== 发送私聊消息 ===');
      /**
       * 使用SDK调用发送消息接口
       * https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/im-v1/message/create
       */
      const result = await client.im.v1.message.create({
        params: {
          receive_id_type: 'chat_id',
        },
        data: {
          receive_id: chat_id,
          content: content,
          msg_type: msgType,
        },
      });
      console.log('私聊消息发送成功');
      return result;
    } else {
      if (thread_id) {
        console.log('=== 在现有话题中回复 ===');
        console.log('回复消息ID:', message_id);

        /**
         * 在现有话题中回复消息
         * https://open.feishu.cn/document/server-docs/im-v1/message/reply
         */
        const result = await client.im.v1.message.reply({
          path: {
            message_id: message_id,
          },
          data: {
            content: content,
            msg_type: msgType,
          },
        });
        console.log('话题内回复发送成功');
        return result;
      } else {
        console.log('=== 创建新话题回复 ===');
        console.log('回复消息ID:', message_id);
        console.log('使用 reply_in_thread: true 创建话题');

        /**
         * 不在话题中时，创建新话题并回复
         * https://open.feishu.cn/document/server-docs/im-v1/message/reply
         */
        const result = await client.im.v1.message.reply({
          path: {
            message_id: message_id,
          },
          data: {
            content: content,
            msg_type: msgType,
            reply_in_thread: true,
          },
        });
        console.log('创建话题发送成功');
        return result;
      }
    }
  } catch (replyError) {
    console.error('发送回复失败:', replyError);
    console.error('回复错误详情:', replyError.message);
    throw replyError;
  }
}

/**
 * 发送成功响应给飞书，无论内容如何都要确保响应成功
 * @param {object} data - 事件数据
 * @param {string} content - 响应内容
 * @param {string} type - 响应类型描述
 * @param {string} msgType - 消息类型
 * @returns {Promise<boolean>} 是否发送成功
 */
async function sendAckToFeishu(data, content, type, msgType = 'text') {
  try {
    console.log(`📤 发送成功响应给飞书 (类型: ${type})`);
    console.log(`响应内容: ${content}`);

    await sendResponse(data, JSON.stringify({ text: content }), msgType);
    console.log(`✅ ${type} 响应发送成功，飞书不会重试`);
    return true;
  } catch (error) {
    console.error(`❌ ${type} 响应发送失败:`, error);

    // 尝试发送备用响应
    try {
      const fallbackResponse = `事件处理完成 (${type})`;
      await sendResponse(data, JSON.stringify({ text: fallbackResponse }), msgType);
      console.log(`✅ ${type} 备用响应发送成功`);
      return true;
    } catch (fallbackError) {
      console.error(`❌ ${type} 备用响应也失败:`, fallbackError);
      return false;
    }
  }
}

export {
  sendResponse,
  sendAckToFeishu
};