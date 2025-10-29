/**
 * 模块功能测试脚本
 * 验证各个模块的基本功能是否正常
 */

import { isDuplicateEvent, getEventId } from './utils/eventDeduplicator.js';
import { eventQueue, EventQueue } from './utils/eventQueue.js';
import { detectEventTriggerType } from './utils/eventDetector.js';
import { isClaudeServiceAvailable } from './services/claudeService.js';

console.log('🧪 开始模块功能测试...\n');

// 测试事件去重模块
console.log('=== 测试事件去重模块 ===');
const testEvent1 = {
  event_id: 'test_event_123',
  message: { message_id: 'msg_123' }
};
const testEvent2 = {
  uuid: 'test_uuid_456',
  message: { message_id: 'msg_456' }
};
const testEvent3 = {
  message: { message_id: 'msg_789' }
};

console.log('事件1 ID:', getEventId(testEvent1)); // 应该返回 event_test_event_123
console.log('事件2 ID:', getEventId(testEvent2)); // 应该返回 uuid_test_uuid_456
console.log('事件3 ID:', getEventId(testEvent3)); // 应该返回 msg_msg_789

console.log('重复测试1 - 首次:', isDuplicateEvent(testEvent1)); // false
console.log('重复测试1 - 再次:', isDuplicateEvent(testEvent1)); // true

// 测试事件队列模块
console.log('\n=== 测试事件队列模块 ===');
const testQueue = new EventQueue();
console.log('队列状态:', testQueue.getStatus());

// 测试事件检测模块
console.log('\n=== 测试事件检测模块 ===');
const testPrivateMessage = {
  message: {
    chat_type: 'p2p',
    message_type: 'text',
    content: JSON.stringify({ text: 'hello' })
  }
};
const testGroupMessage = {
  message: {
    chat_type: 'group',
    message_type: 'text',
    content: JSON.stringify({ text: 'hello bot' }),
    mentions: []
  }
};

console.log('私聊消息类型:', detectEventTriggerType(testPrivateMessage)); // private_message
console.log('群聊消息类型:', detectEventTriggerType(testGroupMessage)); // ignore

// 测试Claude服务
console.log('\n=== 测试Claude服务模块 ===');
console.log('Claude服务可用:', isClaudeServiceAvailable());

console.log('\n✅ 模块功能测试完成！');