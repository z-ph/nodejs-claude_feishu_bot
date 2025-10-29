/**
 * 事件去重模块
 * 支持飞书事件v1.0 (uuid) 和 v2.0 (event_id) 的去重机制
 */

// 事件缓存和消息缓存
const eventCache = new Set();
const messageCache = new Set();

/**
 * 获取事件唯一标识符
 * @param {object} data - 事件数据
 * @returns {string|null} 事件唯一标识符
 */
function getEventId(data) {
  // 尝试获取 v2.0 事件的 event_id
  if (data.event_id) {
    return `event_${data.event_id}`;
  }

  // 尝试获取 v1.0 事件的 uuid
  if (data.uuid) {
    return `uuid_${data.uuid}`;
  }

  // 兜底使用消息ID
  if (data.message && data.message.message_id) {
    return `msg_${data.message.message_id}`;
  }

  return null;
}

/**
 * 改进的去重函数 - 支持多种标识符
 * @param {object} data - 事件数据
 * @returns {boolean} 是否为重复事件
 */
function isDuplicateEvent(data) {
  // 获取事件唯一标识符
  const eventId = getEventId(data);

  if (!eventId) {
    console.warn('⚠️ 无法获取事件ID，跳过去重检查');
    return false;
  }

  if (eventCache.has(eventId)) {
    console.log(`🔄 检测到重复事件: ${eventId}`);
    return true;
  }

  eventCache.add(eventId);

  // 清理5分钟前的缓存
  setTimeout(() => {
    eventCache.delete(eventId);
  }, 5 * 60 * 1000);

  return false;
}

/**
 * 消息去重函数（向后兼容）
 * @param {string} messageId - 消息ID
 * @returns {boolean} 是否为重复消息
 */
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

export {
  isDuplicateEvent,
  isDuplicateMessage,
  getEventId
};