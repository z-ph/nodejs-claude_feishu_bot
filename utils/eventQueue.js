/**
 * 事件队列模块
 * 处理异步事件队列，支持微任务处理
 */

import { getClaudeResponse, getClaudeResponseWithThinking, ENABLE_DEEP_THINKING } from '../services/claudeService.js';
import { getContextAsync } from '../services/contextService.js';
import { sendResponse, editMessage, replyToFeishu } from '../services/messageService.js';
import { client } from '../config/larkConfig.js';
import { MESSAGE_TEMPLATES, ERROR_CONFIG } from '../config/deepThinkingConfig.js';

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
    const { data, eventType, userMessage, thread_id, needsImmediateReply } = eventData;
    console.log(`🔄 异步处理事件: ${eventType}`);

    let thinkingMessageId = null;

    // 第一步：发送立即回复（如果需要）
    // 注意：深度思考模式会在onThinkingStart中处理，这里跳过
    if (needsImmediateReply && !ENABLE_DEEP_THINKING) {
      try {
        console.log('📤 发送立即回复...');
        // 为立即回复设置3秒超时，避免阻塞过久
        const thinkingResult = await Promise.race([
          replyToFeishu(data),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('立即回复超时')), 3000)
          )
        ]);
        thinkingMessageId = thinkingResult?.data?.message_id || null;
        console.log('✅ 立即回复发送成功，消息ID:', thinkingMessageId);
      } catch (error) {
        console.warn('⚠️ 立即回复发送失败，将继续处理:', error.message);
        // 即使立即回复失败，也继续处理Claude回复
      }
    }

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

      let claudeResponse;

      if (ENABLE_DEEP_THINKING) {
        console.log('🧠 ��用深度思考流式模式处理消息');

        // 思考开始回调函数 - 发送思考提示，保存消息ID用于后续编辑
        const onThinkingStart = async () => {
          try {
            const thinkingText = MESSAGE_TEMPLATES.THINKING_START;
            const immediateResponse = await sendResponse(data, JSON.stringify({
              text: thinkingText
            }), 'text');

            // 保存消息ID以便后续编辑为最终答案
            if (immediateResponse && immediateResponse.data && immediateResponse.data.message_id) {
              thinkingMessageId = immediateResponse.data.message_id;
              console.log('✅ 已发送思考提示消息，准备流式更新');
            }
          } catch (error) {
            console.warn('发送思考提示失败:', error.message);
          }
        };

        // 飞书API限制下的智能流式传输 - 基于文本消息150KB限制
        let segmentCount = 0;
        let currentSegmentContent = '';
        const FEISHU_TEXT_MAX_SIZE = 150000; // 文本消息150KB限制
        const SEGMENT_THRESHOLD = 120000; // 120KB时发送新消息，留30KB安全边量

        const onChunkReady = async (chunkText, currentChunk, fullResponse) => {
          currentSegmentContent = currentChunk; // 始终保持最新内容

          // 检查是否接近飞书API大小限制
          const currentSize = Buffer.byteLength(currentSegmentContent, 'utf8');
          const shouldSendNewSegment = currentSize >= SEGMENT_THRESHOLD;

          if (shouldSendNewSegment && segmentCount < 10) { // 限制最大段数
            try {
              segmentCount++;
              console.log(`📏 接近API大小限制 (${currentSize} bytes)，发送第${segmentCount}段消息`);

              // 提取并清理显示内容
              let displayContent = currentSegmentContent;
              if (currentSegmentContent.includes('【思考中】')) {
                displayContent = currentSegmentContent.replace(/【思考中】\s*/, '').trim();
              } else if (currentSegmentContent.includes('【答案】')) {
                const answerMatch = currentSegmentContent.match(/【答案】([\s\S]*)/);
                if (answerMatch) {
                  displayContent = answerMatch[1].trim();
                }
              }

              // 构建文本分段消息内容
              const segmentHeader = segmentCount === 1
                ? `🧠 AI 深度思考回复 (第${segmentCount}段)`
                : `🧠 继续思考 (第${segmentCount}段)`;

              const segmentContent = `${segmentHeader}\n\n${displayContent}\n\n📝 AI正在继续生成...`;

              if (segmentCount === 1) {
                // 第一段：编辑原思考消息
                await eventQueue.editMessageSafely(thinkingMessageId, segmentContent);
                console.log(`✅ 第1段编辑成功`);
              } else {
                // 后续段：发送新的文本消息
                await sendResponse(data, JSON.stringify({ text: segmentContent }), 'text');
                console.log(`✅ 第${segmentCount}段发送成功`);
              }

            } catch (error) {
              console.warn(`第${segmentCount}段发送失败:`, error.message);
            }
          }
        };

        claudeResponse = await getClaudeResponseWithThinking(fullMessage, onThinkingStart, onChunkReady);
      } else {
        console.log('🚀 使用标准模式处理消息');
        claudeResponse = await getClaudeResponse(fullMessage);
      }

  
      // 发送回复（流式模式直接编辑最终结果，不再分段）
      if (ENABLE_DEEP_THINKING) {
        console.log('🎯 流式模式完成，直接编辑最终结果...');
        await this.finalizeStreamingResponse(data, claudeResponse, userMessage, thinkingMessageId);
      } else {
        // 标准模式仍使用原有发送方式
        let formattedResponse;
        const modePrefix = MESSAGE_TEMPLATES.STANDARD_PREFIX;
        const modeSuffix = MESSAGE_TEMPLATES.STANDARD_SUFFIX;

        if (claudeResponse.length > 200) {
          formattedResponse = `${modePrefix}\n\n${claudeResponse.substring(0, 200)}...\n\n${claudeResponse.substring(200, 400)}...\n\n*（回复较长，请分段阅读）*\n\n---\n💭 原始消息: ${userMessage}${modeSuffix}`;
        } else {
          formattedResponse = `${modePrefix}\n\n${claudeResponse}\n\n---\n💭 原始消息: ${userMessage}${modeSuffix}`;
        }
        await this.sendResponseAsync(data, claudeResponse, formattedResponse, userMessage, thinkingMessageId);
      }

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
   * @param {string} thinkingMessageId - 思考中消息ID，用于编辑消息
   */
  async sendResponseAsync(data, claudeResponse, formattedResponse, userMessage, thinkingMessageId = null) {
    const shouldCreateCard = claudeResponse.length > 100 || userMessage.includes('创建') || userMessage.includes('话题');

    // 构建最终回复内容
    let finalContent;
    let msgType;

    if (shouldCreateCard) {
      const modePrefix = ENABLE_DEEP_THINKING ? MESSAGE_TEMPLATES.DEEP_THINKING_PREFIX : MESSAGE_TEMPLATES.STANDARD_PREFIX;
    const modeSuffix = ENABLE_DEEP_THINKING ? MESSAGE_TEMPLATES.DEEP_THINKING_SUFFIX : MESSAGE_TEMPLATES.STANDARD_SUFFIX;

    const cardContent = {
        config: { wide_screen_mode: true },
        elements: [
          {
            tag: 'div',
            text: {
              content: `${modePrefix}\n\n${claudeResponse}\n\n---\n💭 原始消息: ${userMessage}${modeSuffix}`,
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
      finalContent = JSON.stringify(cardContent);
      msgType = 'interactive';
    } else {
      const richTextContent = { text: formattedResponse };
      finalContent = JSON.stringify(richTextContent);
      msgType = 'text';
    }

    // 优先尝试编辑之前的"思考中"消息为最终答案
    if (thinkingMessageId) {
      try {
        console.log('📝 尝试编辑思考消息为最终答案...');

        // 检查消息大小，飞书文本消息限制150KB，卡片消息限制30KB
        const maxSize = msgType === 'text' ? 150 * 1024 : 30 * 1024; // 150KB for text, 30KB for cards
        const contentSize = Buffer.byteLength(finalContent, 'utf8');
        const textContent = this.extractTextFromContent(finalContent, msgType);
        const textLength = textContent.length;

        console.log(`📏 消息大小检查:`);
        console.log(`   - 消息类型: ${msgType}`);
        console.log(`   - 最大大小: ${maxSize} bytes`);
        console.log(`   - 实际大小: ${contentSize} bytes`);
        console.log(`   - 文本长度: ${textLength} 字符`);
        console.log(`   - thinkingMessageId: ${thinkingMessageId}`);

        if (contentSize <= maxSize && textLength <= 4000) {
          // 消息大小合适，直接编辑
          console.log('✅ 消息大小合适，直接编辑');
          await editMessage(thinkingMessageId, textContent);
          console.log('✅ 思考消息已成功编辑为最终答案');
          return;
        } else {
          console.warn(`⚠️ 消息过大或文本过长，将分段发送`);
          console.warn(`   - 大小: ${contentSize} bytes > ${maxSize} bytes 或 文本: ${textLength} > 4000 字符`);

          // 计算合适的分段大小
          const maxChunkSize = Math.min(3000, maxSize - 500); // 最大3000字符，预留500字节

          if (textContent.length > maxChunkSize) {
            console.log(`📝 分段处理：总长度 ${textContent.length}，每段最大 ${maxChunkSize}`);

            // 计算分段数量
            const chunks = [];
            let currentPos = 0;

            while (currentPos < textContent.length) {
              let endPos = Math.min(currentPos + maxChunkSize, textContent.length);

              // 尝试在句号、换行符等位置断句
              if (endPos < textContent.length) {
                const breakPoints = ['。\n', '！\n', '？\n', '。\n\n', '！\n\n', '？\n\n', '。\n', '！\n', '？\n', '\n\n', '\n'];
                let bestBreak = -1;

                for (const breakPoint of breakPoints) {
                  const breakIndex = textContent.lastIndexOf(breakPoint, endPos);
                  if (breakIndex > currentPos && breakIndex > bestBreak) {
                    bestBreak = breakIndex + breakPoint.length;
                  }
                }

                if (bestBreak > currentPos) {
                  endPos = bestBreak;
                }
              }

              chunks.push(textContent.substring(currentPos, endPos));
              currentPos = endPos;
            }

            console.log(`📝 将分为 ${chunks.length} 段发送`);

            // 编辑第一段
            const firstChunk = chunks[0];
            if (chunks.length > 1) {
              const firstPart = firstChunk + `\n\n*(回复较长，共${chunks.length}段，剩余${chunks.length-1}段将在下条消息中继续...)*`;
              await editMessage(thinkingMessageId, firstPart);
              console.log(`✅ 已编辑为第1段/${chunks.length}`);
            } else {
              await editMessage(thinkingMessageId, firstChunk);
              console.log(`✅ 已编辑为完整回复`);
              return;
            }

            // 发送剩余段落
            for (let i = 1; i < chunks.length; i++) {
              const chunkHeader = i === chunks.length - 1
                ? `*(第${i+1}段/${chunks.length} - 最后一段)*\n\n`
                : `*(第${i+1}段/${chunks.length})*\n\n`;

              const chunkContent = chunkHeader + chunks[i];
              await sendResponse(data, JSON.stringify({ text: chunkContent }), 'text');
              console.log(`✅ 已发送第${i+1}段/${chunks.length}`);

              // 添加小延迟避免发送过快
              if (i < chunks.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 200));
              }
            }

            console.log('✅ 所有分段发送完成');
            return;
          }
        }
      } catch (editError) {
        console.warn('⚠️ 消息编辑失败，将发送新消息:', editError.message);
        if (editError.response?.data?.code === ERROR_CONFIG.EDIT_LIMIT_ERROR_CODE) {
          console.warn('⚠️ 消息编辑次数已达上限，发送新消息');
        }
        // 编辑失败时继续发送新消息
      }
    }

    // 编辑失败或没有消息ID时，发送新消息
    console.log('📝 发送新消息作为回复...');
    try {
      await sendResponse(data, finalContent, msgType);
      console.log('✅ 新消息发送成功');
    } catch (error) {
      console.error('发送回复失败:', error);
      // 尝试发送简单文本回复作为备份
      try {
        const simpleResponse = claudeResponse.length > 1000
          ? claudeResponse.substring(0, 1000) + '...\n\n*(回复较长，已截断显示)*'
          : claudeResponse;
        await sendResponse(data, JSON.stringify({ text: simpleResponse }), 'text');
        console.log('备份回复发送成功');
      } catch (backupError) {
        console.error('备份回复也失败:', backupError);
      }
    }
  }

  /**
   * 从内容中提取纯文本，用于消息编辑
   * @param {string} content - 消息内容
   * @param {string} msgType - 消息类型
   * @returns {string} 提取的文本内容
   */
  extractTextFromContent(content, msgType) {
    try {
      const parsed = JSON.parse(content);

      if (msgType === 'interactive') {
        // 从卡片中提取文本内容
        const divElement = parsed.elements?.find(el => el.tag === 'div' && el.text?.content);
        if (divElement) {
          return divElement.text.content;
        }
      } else if (msgType === 'text') {
        // 从文本消息中提取内容
        return parsed.text || content;
      }

      return content;
    } catch (error) {
      console.warn('提取文本内容失败:', error.message);
      return content;
    }
  }

  
  /**
   * 安全地编辑消息（用于流式更新）
   * @param {string} messageId - 消息ID
   * @param {string} content - 新内容
   */
  async editMessageSafely(messageId, content) {
    try {
      const contentSize = Buffer.byteLength(content, 'utf8');
      const maxSafeSize = 140000; // 140KB安全边量

      if (contentSize <= maxSafeSize) {
        await editMessage(messageId, content);
        console.log(`✅ 安全编辑成功: ${contentSize} bytes`);
      } else {
        console.warn(`⚠️ 内容过大，截断编辑: ${contentSize} bytes`);
        const truncatedContent = content.substring(0, 45000) + '\n\n...*(内容过长，已截断)*';
        await editMessage(messageId, truncatedContent);
      }
    } catch (error) {
      console.error('安全编辑失败:', error);
      throw error;
    }
  }

  /**
   * 实时更新部分消息（流式传输用）
   * @param {string} messageId - 消息ID
   * @param {string} currentChunk - 当前内容块
   * @param {string} fullResponse - 完整响应
   * @param {number} segmentIndex - 段落索引
   */
  async updatePartialMessage(messageId, currentChunk, fullResponse, segmentIndex) {
    try {
      // 构建部分响应内容
      const modePrefix = MESSAGE_TEMPLATES.DEEP_THINKING_PREFIX;
      const partialContent = `${modePrefix}\n\n${currentChunk}\n\n📝 *正在生成中... (${Math.round((currentChunk.length / fullResponse.length) * 100)}%)*`;

      // 检查消息大小
      const contentSize = Buffer.byteLength(partialContent, 'utf8');
      const maxSafeSize = 140000; // 140KB安全边量

      if (contentSize <= maxSafeSize) {
        await editMessage(messageId, partialContent);
        console.log(`✅ 部分消息更新成功: ${contentSize} bytes`);
      } else {
        console.warn(`⚠️ 部分消息过大，跳过更新: ${contentSize} bytes`);
      }
    } catch (error) {
      console.error('部分消息更新失败:', error);
    }
  }

  /**
   * 完成流式响应（直接编辑最终结果）
   * @param {object} data - 事件数据
   * @param {string} fullResponse - 完整响应
   * @param {string} userMessage - 用户消息
   * @param {string} thinkingMessageId - 思考消息ID
   */
  async finalizeStreamingResponse(data, fullResponse, userMessage, thinkingMessageId = null) {
    try {
      const modePrefix = MESSAGE_TEMPLATES.DEEP_THINKING_PREFIX;
      const modeSuffix = MESSAGE_TEMPLATES.DEEP_THINKING_SUFFIX;

      // 清理响应内容
      let cleanResponse = fullResponse;
      if (cleanResponse.includes('【思考中】')) {
        cleanResponse = cleanResponse.replace(/【思考中】\s*/, '').trim();
      } else if (cleanResponse.includes('【答案】')) {
        const answerMatch = cleanResponse.match(/【答案】([\s\S]*)/);
        if (answerMatch) {
          cleanResponse = answerMatch[1].trim();
        }
      }

      // 构建最终回复内容
      const finalContent = `${modePrefix}\n\n${cleanResponse}\n\n---\n💭 原始消息: ${userMessage}${modeSuffix}`;
      const finalSize = Buffer.byteLength(finalContent, 'utf8');

      console.log(`📏 最终响应大小: ${finalSize} bytes, ${finalContent.length} 字符`);

      if (finalSize <= 120000) {
        // 响应不大，直接编辑原消息
        if (thinkingMessageId) {
          await this.editMessageSafely(thinkingMessageId, finalContent);
          console.log('✅ 流式响应完成，直接编辑最终答案');
        } else {
          await sendResponse(data, JSON.stringify({ text: finalContent }), 'text');
          console.log('✅ 流式响应完成，发送新消息');
        }
      } else {
        // 响应很大，需要智能分段
        console.log('📝 响应较大，进行智能分段...');
        await this.sendLargeResponseInSegments(data, cleanResponse, userMessage, thinkingMessageId);
      }
    } catch (error) {
      console.error('流式响应完成失败:', error);
      // 降级到简单发送
      try {
        await sendResponse(data, JSON.stringify({
          text: fullResponse || '回复生成失败，请稍后重试。'
        }), 'text');
      } catch (fallbackError) {
        console.error('降级发送也失败:', fallbackError);
      }
    }
  }

  /**
   * 分段发送大型富文本响应
   * @param {object} data - 事件数据
   * @param {string} cleanResponse - 清理后的响应
   * @param {string} userMessage - 用户消息
   * @param {string} thinkingMessageId - 思考消息ID
   */
  async sendLargeResponseInRichTextSegments(data, cleanResponse, userMessage, thinkingMessageId = null) {
    const modePrefix = MESSAGE_TEMPLATES.DEEP_THINKING_PREFIX;
    const modeSuffix = MESSAGE_TEMPLATES.DEEP_THINKING_SUFFIX;
    const SEGMENT_SIZE = 20000; // 每段约20KB，为富文本预留安全边量
    const maxSegments = 10;

    const segments = [];
    let currentPos = 0;

    // 智能分段
    while (currentPos < cleanResponse.length && segments.length < maxSegments) {
      let endPos = Math.min(currentPos + SEGMENT_SIZE, cleanResponse.length);

      if (endPos < cleanResponse.length) {
        // 寻找合适的断句位置
        const breakPoints = ['。\n\n', '！\n\n', '？\n\n', '。\n', '！\n', '？\n', '\n\n', '\n'];
        let bestBreak = -1;

        for (const breakPoint of breakPoints) {
          const breakIndex = cleanResponse.lastIndexOf(breakPoint, endPos);
          if (breakIndex > currentPos && breakIndex > bestBreak) {
            bestBreak = breakIndex + breakPoint.length;
          }
        }

        if (bestBreak > currentPos) {
          endPos = bestBreak;
        }
      }

      segments.push(cleanResponse.substring(currentPos, endPos));
      currentPos = endPos;
    }

    console.log(`📝 富文本将分为 ${segments.length} 段发送`);

    // 发送各段
    for (let i = 0; i < segments.length; i++) {
      const segmentNumber = i + 1;
      const isLastSegment = i === segments.length - 1;

      let segmentContent;
      if (isLastSegment) {
        // 最后一段包含完整格式
        segmentContent = `${modePrefix}\n\n${segments[i]}\n\n---\n💭 原始消息: ${userMessage}${modeSuffix}`;
      } else {
        // 中间段简化格式
        segmentContent = `🧠 **AI 深度思考 (第${segmentNumber}/${segments.length}段)**\n\n${segments[i]}\n\n📝 *继续生成中...*`;
      }

      // 构建富文本���息（正确的飞书卡片格式）
      const richTextSegment = {
        config: {
          wide_screen_mode: true
        },
        elements: [
          {
            tag: 'div',
            text: {
              content: segmentContent,
              tag: 'lark_md'
            }
          }
        ]
      };

      try {
        if (segmentNumber === 1 && thinkingMessageId) {
          // 第一段编辑原消息
          await this.editMessageSafely(thinkingMessageId, segmentContent);
          console.log(`✅ 第1段编辑成功`);
        } else {
          // 后续段发送新消息
          await sendResponse(data, JSON.stringify({ text: segmentContent }), 'text');
          console.log(`✅ 第${segmentNumber}段发送成功`);
        }

        // 段落间延迟
        if (!isLastSegment) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      } catch (error) {
        console.error(`第${segmentNumber}段富文本发送失败:`, error);
      }
    }

    console.log('✅ 大型富文本响应分段发送完成');
  }

  /**
   * 智能分段发送流式响应（保留用于特殊情况）
   * @param {object} data - 事件数据
   * @param {string} fullResponse - 完整响应
   * @param {string} userMessage - 用户消息
   * @param {string} thinkingMessageId - 思考消息ID
   */
  async sendStreamingResponse(data, fullResponse, userMessage, thinkingMessageId = null) {
    const modePrefix = MESSAGE_TEMPLATES.DEEP_THINKING_PREFIX;
    const modeSuffix = MESSAGE_TEMPLATES.DEEP_THINKING_SUFFIX;
    const segmentSize = 3500; // 每段3500字符，确保在安全范围内
    const maxSegments = 10; // 最大段数

    // 如果响应不长，直接发送
    if (fullResponse.length <= segmentSize) {
      const formattedResponse = `${modePrefix}\n\n${fullResponse}\n\n---\n💭 原始消息: ${userMessage}${modeSuffix}`;

      if (thinkingMessageId) {
        await editMessage(thinkingMessageId, formattedResponse);
        console.log('✅ 流式响应编辑完成');
      } else {
        await sendResponse(data, JSON.stringify({ text: formattedResponse }), 'text');
      }
      return;
    }

    // 长响应分段处理
    console.log(`📝 开始分段发送流式响应: ${fullResponse.length} 字符`);

    // 计算分段
    const segments = [];
    let currentPos = 0;

    while (currentPos < fullResponse.length && segments.length < maxSegments) {
      let endPos = Math.min(currentPos + segmentSize, fullResponse.length);

      // 尝试在合适的断句位置分割
      if (endPos < fullResponse.length) {
        const breakPoints = ['。\n\n', '！\n\n', '？\n\n', '。\n', '！\n', '？\n', '\n\n', '\n'];
        let bestBreak = -1;

        for (const breakPoint of breakPoints) {
          const breakIndex = fullResponse.lastIndexOf(breakPoint, endPos);
          if (breakIndex > currentPos && breakIndex > bestBreak) {
            bestBreak = breakIndex + breakPoint.length;
          }
        }

        if (bestBreak > currentPos) {
          endPos = bestBreak;
        }
      }

      segments.push(fullResponse.substring(currentPos, endPos));
      currentPos = endPos;
    }

    console.log(`📝 响应将分为 ${segments.length} 段发送`);

    // 发送第一段（编辑原思考消息）
    if (thinkingMessageId && segments.length > 0) {
      const firstSegment = segments[0];
      const firstContent = `${modePrefix}\n\n${firstSegment}\n\n📝 *流式生成中 (1/${segments.length})*`;

      try {
        await editMessage(thinkingMessageId, firstContent);
        console.log(`✅ 第1段编辑成功`);
      } catch (error) {
        console.warn('第1段编辑失败，将发送新消息:', error.message);
        await sendResponse(data, JSON.stringify({ text: firstContent }), 'text');
      }

      // 发送剩余段落
      for (let i = 1; i < segments.length; i++) {
        const segmentHeader = i === segments.length - 1
          ? `*(最后一段 ${i+1}/${segments.length})*\n\n`
          : `*(${i+1}/${segments.length})*\n\n`;

        const segmentContent = segmentHeader + segments[i];
        const fullSegmentContent = `${modePrefix}\n\n${segmentContent}\n\n---\n💭 原始消息: ${userMessage}${modeSuffix}`;

        try {
          await sendResponse(data, JSON.stringify({ text: fullSegmentContent }), 'text');
          console.log(`✅ 第${i+1}段发送成功`);

          // 添加延迟避免发送过快
          if (i < segments.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        } catch (error) {
          console.error(`第${i+1}段发送失败:`, error);
        }
      }

      // 发送完成消息
      if (segments.length > 1) {
        const completionMessage = `✨ **流式响应完成**\n\n共 ${segments.length} 段，总计 ${fullResponse.length} 字符`;
        try {
          await sendResponse(data, JSON.stringify({ text: completionMessage }), 'text');
          console.log('✅ 完成消息发送成功');
        } catch (error) {
          console.warn('完成消息发送失败:', error.message);
        }
      }
    } else {
      // 没有思考消息ID，直接发送所有段落
      for (let i = 0; i < segments.length; i++) {
        const segmentHeader = `*(${i+1}/${segments.length})*\n\n`;
        const segmentContent = segmentHeader + segments[i];
        const fullSegmentContent = `${modePrefix}\n\n${segmentContent}\n\n---\n💭 原始消息: ${userMessage}${modeSuffix}`;

        try {
          await sendResponse(data, JSON.stringify({ text: fullSegmentContent }), 'text');
          console.log(`✅ 第${i+1}段发送成功`);

          if (i < segments.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        } catch (error) {
          console.error(`第${i+1}段发送失败:`, error);
        }
      }
    }

    console.log('✅ 流式响应分段发送完成');
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