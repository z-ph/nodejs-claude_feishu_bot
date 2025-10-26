import * as Lark from '@larksuiteoapi/node-sdk';
import Anthropic from '@anthropic-ai/sdk';
import { config } from 'dotenv';

// 加载环境变量，确保从 .env 文件优先读取
config({ override: true });

// Claude API 配置
const ANTHROPIC_BASE_URL = process.env.ANTHROPIC_BASE_URL;
const ANTHROPIC_AUTH_TOKEN = process.env.ANTHROPIC_AUTH_TOKEN;
console.log('📋 环境变量检查:', {
  'ANTHROPIC_BASE_URL': ANTHROPIC_BASE_URL,
  'ANTHROPIC_AUTH_TOKEN': ANTHROPIC_AUTH_TOKEN ? '已设置' : '未设置',
  'APP_ID': process.env.APP_ID,
  'APP_NAME': process.env.APP_NAME,
  'BOT_OPEN_ID': process.env.BOT_OPEN_ID,
  'BOT_USER_ID': process.env.BOT_USER_ID
});

if (!ANTHROPIC_BASE_URL || !ANTHROPIC_AUTH_TOKEN) {
  throw new Error('请在 .env 文件中配置 ANTHROPIC_BASE_URL 和 ANTHROPIC_AUTH_TOKEN');
}

// 事件处理器缓存和去重
const eventCache = new Map();
const messageCache = new Set();

// 消息去重函数
function isDuplicateMessage(messageId) {
  if (messageCache.has(messageId)) {
    console.log(`🔄 检测到重复消息: ${messageId}`);
    return true;
  }
  messageCache.add(messageId);

  // 清理5分钟前的缓存
  setTimeout(() => {
    messageCache.delete(messageId);
  }, 5 * 60 * 1000);

  return false;
}

/**
 * 发送成功响应给飞书，无论内容如何都要确保响应成功
 * @param {object} data - 事件数据
 * @param {string} content - 响应内容
 * @param {string} type - 响应类型描述
 * @param {string} msgType - 消息类型
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

/**
 * 检测事件触发类型
 * @param {object} data - 事件数据
 * @returns {string} 触发类型：'private_message' | 'group_mention' | 'ignore'
 */
function detectEventTriggerType(data) {
  try {
    const { message, sender } = data;
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
 * 发送回复消息的通用函数
 * @param {object} data - 事件数据
 * @param {string} content - 消息内容
 * @param {string} msgType - 消息类型，默认为 'text'
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
       * 使用SDK调用发送消息接口。 Use SDK to call send message interface.
       * https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/im-v1/message/create
       */
      const result = await client.im.v1.message.create({
        params: {
          receive_id_type: 'chat_id', // 消息接收者的 ID 类型，设置为会话ID。 ID type of the message receiver, set to chat ID.
        },
        data: {
          receive_id: chat_id, // 消息接收者的 ID 为消息发送的会话ID。 ID of the message receiver is the chat ID of the message sending.
          content: content,
          msg_type: msgType, // 设置消息类型。 Set message type.
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
         * Use SDK to call reply message interface.
         * https://open.feishu.cn/document/server-docs/im-v1/message/reply
         */
        const result = await client.im.v1.message.reply({
          path: {
            message_id: message_id, // 要回复的消息 ID。 Message ID to reply.
          },
          data: {
            content: content,
            msg_type: msgType, // 设置消息类型。 Set message type.
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
         * Use SDK to call reply message interface with thread creation.
         * https://open.feishu.cn/document/server-docs/im-v1/message/reply
         */
        const result = await client.im.v1.message.reply({
          path: {
            message_id: message_id, // 要回复的消息 ID。 Message ID to reply.
          },
          data: {
            content: content,
            msg_type: msgType, // 设置消息类型。 Set message type.
            reply_in_thread: 'true', // 以话题形式进行回复（创建话题） Reply in thread (create thread).
          },
        });
        console.log('创建话题发送成功');
        return result;
      }
    }
  } catch (replyError) {
        console.error('发送回复失败:', replyError);
        console.error('回复错误详情:', replyError.message);

        // 即使回复失败，也要确保给飞书一个响应，避免重试
        try {
          await sendAckToFeishu(
            data,
            '事件处理完成（回复发送失败）',
            '回复发送失败'
          );
        } catch (ackError) {
          console.error('回复失败时的确认响应也发送失败:', ackError);
          console.log('⚠️ 飞书可能会重试，但这已是最后防线');
        }
        // 不再抛出错误，让事件处理正常结束
      }
}

/**
 * 配置应用基础信息和请求域名。
 * App base information and request domain name.
 */
const baseConfig = {
  // 应用的 AppID, 你可以在开发者后台获取。 AppID of the application, you can get it in the developer console.
  appId: process.env.APP_ID,
  // 应用的 AppSecret，你可以在开发者后台获取。 AppSecret of the application, you can get it in the developer console.
  appSecret: process.env.APP_SECRET,
  // 请求域名，如：https://open.feishu.cn。 Request domain name, such as https://open.feishu.cn.
  domain: process.env.BASE_DOMAIN,
};

/**
 * 创建 LarkClient 对象，用于请求OpenAPI, 并创建 LarkWSClient 对象，用于使用长连接接收事件。
 * Create LarkClient object for requesting OpenAPI, and create LarkWSClient object for receiving events using long connection.
 */
const client = new Lark.Client(baseConfig);
const wsClient = new Lark.WSClient(baseConfig);

/**
 * 注册事件处理器。
 * Register event handler.
 */
const eventDispatcher = new Lark.EventDispatcher({}).register({
  /**
   * 注册接收消息事件，处理接收到的消息。
   * Register event handler to handle received messages.
   * https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/im-v1/message/events/receive
   */
  'im.message.receive_v1': async (data) => {
    // 使用 try-catch 包装整个事件处理流程，确保不会因异常导致重试
    try {
      console.log('\n' + '='.repeat(50));
      console.log('=== 开始处理消��事件 ===');
      console.log('时间戳:', new Date().toISOString());

      // 消息去重检查
      if (isDuplicateMessage(data.message.message_id)) {
        console.log('🔄 跳过重复消息，避免重试');
        return; // 对于重复消息直接返回，这样飞书知道消息已处理
      }

      console.log('完整消息数据:', JSON.stringify(data, null, 2));

      // 检测事件类型
      const eventType = detectEventTriggerType(data);
      console.log('=== 事件类型检测结果 ===');
      console.log('事件类型:', eventType);

      // 只有私聊和群聊@才处理，其他事件忽略但响应
      const shouldProcess = ['private_message', 'group_mention'].includes(eventType);

      if (shouldProcess) {
        console.log('✅ 需要处理的事件，继续...');
      } else {
        console.log('🚫 普通群聊消息，直接忽略不响应');
        return; // 直接返回，不发送任何响应
      }

      const {
        message: { content, message_type, chat_type, thread_id, message_id },
      } = data;

      console.log('=== 消息基本信息 ===');
      console.log('message_type:', message_type);
      console.log('chat_type:', chat_type);
      console.log('thread_id:', thread_id);
      console.log('message_id:', message_id);
      console.log('content:', content);

      /**
       * 解析用户发送的消息。
       * Parse message sent by the user.
       */
      let userMessage = '';

      try {
        if (message_type === 'text') {
          userMessage = JSON.parse(content).text;
          console.log('=== 解析文本消息 ===');
          console.log('解析后的文本:', userMessage);
        } else {
          console.log('非文本消息类型:', message_type);
          userMessage = '解析消息失败，请发送文本消息 \nparse message failed, please send text message';
          // 对于非文本消息，直接返回错误信息
          await sendResponse(data, userMessage);
          return;
        }
      } catch (error) {
        console.error('解析消息内容失败:', error);
        console.error('错误详情:', error.message);
        // 解析消息失败，返回错误信息。 Parse message failed, return error message.
        userMessage = '解析消息失败，请发送文本消息 \nparse message failed, please send text message';

        // 确保即使解析失败也会响应飞书
        try {
          await sendResponse(data, userMessage);
          console.log('✅ 解析错误响应发送成功');
        } catch (responseError) {
          console.error('解析错误时发送响应也失败:', responseError);

          // 最后的保底措施
          try {
            await sendResponse(data, JSON.stringify({
              text: '事件处理完成（解析错误)'
            }));
            console.log('✅ 解析错误保底响应发送成功');
          } catch (fallbackError) {
            console.error('连保底响应都失败:', fallbackError);
            console.log('⚠️ 飞书可能会重试，这是最后防线');
          }
        }
        return;
      }

      console.log(`📨 收到用户消息: ${userMessage}`);

      // 获取话题上下文（如果在话题中）
      let contextInfo = '';
      if (thread_id) {
        console.log('=== 话题检测 ===');
        console.log('消息在话题中，thread_id:', thread_id);
        console.log('开始获取话题上下文...');

        try {
          console.log('调用API获取话题历史消息...');
          console.log('API参数:', {
            container_id_type: 'thread',
            container_id: thread_id,
            page_size: 10
          });

          const threadHistory = await client.im.v1.message.list({
            params: {
              container_id_type: 'thread', // 查询类型为话题
              container_id: thread_id, // 话题ID
              page_size: 10, // 获取最近10条消息
            },
          });

          console.log('API调用成功，响应状态:', threadHistory.code);
          console.log('API响应数据:', JSON.stringify(threadHistory, null, 2));

          if (threadHistory.data && threadHistory.data.items) {
            const messages = threadHistory.data.items;

            const messageTexts = messages.map(msg => (msg.chat_id+":"+msg.body.content))

            if (messageTexts.length > 0) {
              contextInfo = `📚 话题上下文（最近${messageTexts.length}条消息）：\n${messageTexts.map((text, index) => `${index + 1}. ${text}`).join('\n')}\n\n`;
              console.log('构建的上下文信息:', contextInfo);
            } else {
              console.log('没有找到有效的文本消息作为上下文');
            }
          } else {
            console.log('API响应中没有消息数据');
          }
        } catch (error) {
          console.error('获取话题上下文失败:', error);
          console.error('错误详情:', error.message);
          if (error.response && error.response.data && error.response.data.error) {
            const errorCode = error.response.data.error.code;
            if (errorCode === 99991672) {
              console.error('⚠️  权限不足错误！');
              console.error('应用缺少获取历史消息的权限，请：');
              console.error('1. 点击链接申请权限: https://open.feishu.cn/app/cli_a8775c083cfb100c/auth?q=im:message.history:readonly,im:message:readonly,im:message&op_from=openapi&token_type=tenant');
              console.error('2. 或者到飞书开发者后台手动添加权限: im:message.history:readonly');
              console.error('3. 权限申请后，机器人将能够获取话题上下文');
            }
          }
          if (error.response) {
            console.error('API错误响应:', JSON.stringify(error.response, null, 2));
          }

          // 设置友好的错误提示给用户
          contextInfo = '📝 获取话题上下文失败，可能是权限不足。管理员请联系开发者添加 "im:message.history:readonly" 权限。\n\n';
        }
      } else {
        console.log('=== 话题检测 ===');
        console.log('消息不在话题中，将创建新话题');
      }

      // 构建完整消息给 Claude（包含上下文）
      const fullMessage = contextInfo ? `${contextInfo}当前用户消息: ${userMessage}` : userMessage;
      console.log('=== 发送给 Claude 的完整消息 ===');
      console.log('完整消息内容:', fullMessage);

      // 调用 Claude API 获取智能回复
      const claudeResponse = await getClaudeResponse(fullMessage);

      // 创建格式化的富文本消息，提高可读性并避免刷屏
      let formattedResponse = `🤖 **Claude 智能回复**\n\n${claudeResponse}\n\n---\n💭 原始消息: ${userMessage}`;

      // 如果消息太长，进行分段处理
      if (claudeResponse.length > 200) {
        // 添加换行和时间戳，提高可读性
        formattedResponse = `🤖 **Claude 智能回复**\n\n${claudeResponse.substring(0, 200)}...\n\n${claudeResponse.substring(200, 400)}...\n\n*（回复较长，请分段阅读）*\n\n---\n💭 原始消息: ${userMessage}`;
      }

      // 检查是否需要创建交互式卡片
      const shouldCreateCard = claudeResponse.length > 100 || userMessage.includes('创建') || userMessage.includes('话题');

      try {
        if (shouldCreateCard) {
          // 创建交互式卡片消息
          const cardContent = {
            config: {
              wide_screen_mode: true,
            },
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
                text: {
                  content: '💬 继续对话',
                  tag: 'plain_text'
                },
                type: 'primary',
                url: {
                  android: `https://claude.ai`,
                  ios: `https://claude.ai`,
                  pc: `https://claude.ai`
                }
              },
              {
                tag: 'action',
                text: {
                  content: '📝 创建新话题',
                  tag: 'plain_text'
                },
                type: 'default',
                url: {
                  android: `https://claude.ai/chat`,
                  ios: `https://claude.ai/chat`,
                  pc: `https://claude.ai/chat`
                }
              }
            ]
          };

          console.log(`📄 发送 Claude 交互式卡片: ${claudeResponse.substring(0, 50)}...`);

          // 发送交互式卡片回复
          await sendResponse(data, JSON.stringify(cardContent), 'interactive');
        } else {
          // 创建富文本内容，支持 Markdown 格式
          const richTextContent = {
            text: formattedResponse,
            // 添加一些格式化选项
            // at_users: {
            //   user_id_list: [data.sender.sender_id] // 可以 @ 提及用户
            // }
          };

          console.log(`📤 发送格式化 Claude 回复: ${claudeResponse.substring(0, 50)}...`);

          // 发送富文本回复
          await sendResponse(data, JSON.stringify(richTextContent));
        }
      } catch (replyError) {
        console.error('发送回复失败:', replyError);
        console.error('回复错误详情:', replyError.message);

        // 尝试发送简单文本回复作为备份
        try {
          console.log('尝试发送简单文本回复作为备份...');
          await sendResponse(data, JSON.stringify({ text: claudeResponse }), 'text');
          console.log('备份回复发送成功');
        } catch (backupError) {
          console.error('备份回复也失败:', backupError);
        }
      }

      console.log('=== 消息处理完成 ===');
      console.log('='.repeat(50) + '\n');

    } catch (error) {
      console.error('❌ 事件处理过程中发生严重错误:', error);
      console.error('错误堆栈:', error.stack);

      // 即使发生错误，也要确保给飞书一个响应，避免重试
      try {
        console.log('尝试发送错误响应，避免飞书重试...');
        await sendResponse(data, JSON.stringify({
          text: '抱歉，处理消息时发生错误，请稍后重试。'
        }), 'text');
        console.log('错误响应发送成功');
      } catch (fallbackError) {
        console.error('连错误响应都无法发送:', fallbackError);
      }
    }
  },
});

/**
 * 启动长连接，并注册事件处理器。
 * Start long connection and register event handler.
 */
console.log('🚀 启动飞书 + Claude 聊天机器人...');
console.log('📝 配置信息:');
console.log(`   - Claude Base URL: ${ANTHROPIC_BASE_URL}`);
console.log(`   - Claude Auth Token: ${ANTHROPIC_AUTH_TOKEN.substring(0, 20)}...`);
console.log('✅ 机器人已启动，等待消息...');

wsClient.start({ eventDispatcher });