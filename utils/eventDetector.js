/**
 * 事件检测模块
 * 检测事件类型和触发条件
 */

/**
 * 检测事件触发类型
 * @param {object} data - 事件数据
 * @returns {string} 触发类型：'private_message' | 'group_mention' | 'ignore'
 */
function detectEventTriggerType(data) {
  try {
    const { message } = data;
    const { chat_type, message_type } = message;

    console.log('=== 事件类型分析 ===');
    console.log('chat_type:', chat_type);
    console.log('message_type:', message_type);

    // 只处理文本消息
    if (message_type !== 'text') {
      console.log('非文本消息，忽略');
      return 'ignore';
    }

    if (chat_type === 'p2p') {
      console.log('✅ 私聊消息 - 将处理');
      return 'private_message';
    }

    if (chat_type === 'group') {
      // 检查是否包含@机器人
      let hasMention = false;
      try {
        // 检查mentions数组
        if (message.mentions && Array.isArray(message.mentions)) {
          console.log('📋 检查mentions数组:', JSON.stringify(message.mentions, null, 2));

          // 从环境变量获取机器人open_id
          const botOpenId = process.env.BOT_OPEN_ID;

          console.log('🤖 机器人Open ID:', process.env.BOT_OPEN_ID);

          // 只通过open_id检测，防止误验证到其他机器人
          if (botOpenId) {
            hasMention = message.mentions.some(mention =>
              mention.id && mention.id.open_id === botOpenId
            );
            console.log('🔍 通过open_id检测@机器人:', hasMention);
          }
        }

        if (hasMention) {
          console.log('✅ 群聊中被@ - 将处理');
          return 'group_mention';
        } else {
          console.log('🚫 群聊中未@机器人 - 忽略');
          return 'ignore';
        }

      } catch (error) {
        console.error('解析消息内容失败:', error);
        return 'ignore';
      }
    }

    console.log('未知聊天类型，忽略');
    return 'ignore';

  } catch (error) {
    console.error('检测事件类型时发生错误:', error);
    return 'ignore';
  }
}

export {
  detectEventTriggerType
};