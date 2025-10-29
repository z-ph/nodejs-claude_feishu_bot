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

          // 从环境变量获取机器人标识
          const botOpenId = process.env.BOT_OPEN_ID;
          const botUserId = process.env.BOT_USER_ID;
          const appName = process.env.APP_NAME;

          console.log('🤖 机器人标识信息:', {
            BOT_OPEN_ID: botOpenId,
            BOT_USER_ID: botUserId,
            APP_NAME: appName,
            APP_ID: process.env.APP_ID
          });

          // 方式1: 通过open_id检测
          if (botOpenId) {
            hasMention = message.mentions.some(mention =>
              mention.id && mention.id.open_id === botOpenId
            );
            console.log('🔍 通过open_id检测@机器人:', hasMention);
          }

          // 方式2: 通过user_id检测
          if (!hasMention && botUserId) {
            hasMention = message.mentions.some(mention =>
              mention.id && mention.id.user_id === botUserId
            );
            console.log('🔍 通过user_id检测@机器人:', hasMention);
          }

          // 方式3: 通过name检测（作为备用）
          if (!hasMention && appName) {
            hasMention = message.mentions.some(mention =>
              mention.name === appName
            );
            console.log('🔍 通过name检测@机器人:', hasMention);
          }

          // 方式4: 通过关键词检测（最后备用）
          if (!hasMention) {
            hasMention = message.mentions.some(mention =>
              mention.name && (
                mention.name.includes('机器人') ||
                mention.name.includes('Bot') ||
                mention.name.includes('Assistant')
              )
            );
            console.log('🔍 通过关键词检测@机器人:', hasMention);
          }
        }

        // 额外检查文本中的@
        if (!hasMention && message.text) {
          const botMentionPattern = `@_user_${process.env.APP_ID}`;
          hasMention = message.text.includes(botMentionPattern);
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