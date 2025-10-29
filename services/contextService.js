/**
 * 上下文服务模块
 * 处理话题上下文的获取和管理
 */

import { client } from '../config/larkConfig.js';

/**
 * 异步获取话题上下文
 * @param {string} thread_id - 话题ID
 * @returns {Promise<string>} 上下文信息
 */
async function getContextAsync(thread_id) {
  console.log('=== 异步获取话题上下文 ===');
  console.log('thread_id:', thread_id);

  try {
    const threadHistory = await client.im.v1.message.list({
      params: {
        container_id_type: 'thread',
        container_id: thread_id,
        page_size: 10,
      },
    });

    if (threadHistory.data && threadHistory.data.items) {
      const messages = threadHistory.data.items;
      const messageTexts = messages.map(msg => `${msg.chat_id}:${msg.body.content}`);

      if (messageTexts.length > 0) {
        const contextInfo = `📚 话题上下文（最近${messageTexts.length}条消息）：\n${messageTexts.map((text, index) => `${index + 1}. ${text}`).join('\n')}\n\n`;
        console.log('异步获取上下文成功:', contextInfo);
        return contextInfo;
      }
    }

    console.log('没有找到有效的上下文消息');
    return '';
  } catch (error) {
    console.error('异步获取上下文失败:', error);
    if (error.response && error.response.data && error.response.data.error) {
      const errorCode = error.response.data.error.code;
      if (errorCode === 99991672) {
        console.error('⚠️ 权限不足错误！');
        console.error('应用缺少获取历史消息的权限');
      }
    }
    return '📝 获取话题上下文失败，可能是权限不足。\n\n';
  }
}

/**
 * 同步获取话题上下文（用于兼容性）
 * @param {string} thread_id - 话题ID
 * @returns {Promise<string>} 上下文信息
 */
async function getContextSync(thread_id) {
  return await getContextAsync(thread_id);
}

export {
  getContextAsync,
  getContextSync
};