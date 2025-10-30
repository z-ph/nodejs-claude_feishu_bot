# 深度思考模式配置说明

本目录包含AI聊天机器人深度思考模式的所有配置文件。

## 配置文件概览

### `deepThinkingConfig.js`
深度思考模式的主要配置文件，包含以下模块：

#### 1. 编辑策略配置 (`EDIT_CONFIG`)
控制消息编辑行为的参数：

```javascript
MAX_EDIT_COUNT: 15,        // 最大编辑次数（飞书限制20次，预留安全余量）
UPDATE_INTERVAL: 1500,     // 更新间隔（毫秒）
MIN_CONTENT_GROWTH: 30,    // 触发更新的最小内容增长（字符数）
TRIGGER_PUNCTUATION: [...], // 触发更新的标点符号
```

#### 2. 思考过程配置 (`THINKING_CONFIG`)
控制AI思考过程的参数：

```javascript
MAX_THINKING_TIME: 30000,  // 最大思考时间（毫秒）
SYSTEM_PROMPT: "...",      // AI系统提示词
USER_MESSAGE_TEMPLATE: "...", // 用户消息模板
```

#### 3. 消息模板配置 (`MESSAGE_TEMPLATES`)
各种消息���示模板：

```javascript
THINKING_MESSAGE: "...",     // 思考过程消息模板
DEEP_THINKING_PREFIX: "...", // 深度思考回复前缀
STANDARD_PREFIX: "...",      // 标准模式回复前缀
EDIT_LIMIT_REACHED: "...",   // 编辑次数限制提示
```

#### 4. 错误处理配置 (`ERROR_CONFIG`)
错误处理和重试策略：

```javascript
EDIT_LIMIT_ERROR_CODE: 230072, // 飞书编辑限制错误代码
MAX_RETRY_ATTEMPTS: 3,         // 最大重试次数
FALLBACK_TO_STANDARD_MODE: true, // 是否降级到标准模式
```

#### 5. 监控配置 (`MONITORING_CONFIG`)
日志和监控设置：

```javascript
LOG_LEVEL: 'INFO',             // 日志级别
SHOW_EDIT_PROGRESS: true,      // 显示编辑进度
TRACK_RESPONSE_TIME: true,     // 跟踪响应时间
```

## 参数调优建议

### 编辑策略优化
- **MAX_EDIT_COUNT**: 建议设置为15-18，为飞书的20次限制预留安全余量
- **UPDATE_INTERVAL**: 根据用户反馈调整，1000-2000ms较为合适
- **MIN_CONTENT_GROWTH**: 30-50字符，避免过于频繁的更新

### 思考过程优化
- **MAX_THINKING_TIME**: 30000ms（30秒）适合大多数场景
- **SYSTEM_PROMPT**: 可根据具体需求调整AI的行为模式

### 消息模板定制
- 所有消息模板都支持Markdown格式
- 可根据品牌或用户偏好调整表情符号和文案

## 环境变量配置

除了配置文件，还可以通过环境变量调整部分参数：

```bash
# 启用深度思考模式
ENABLE_DEEP_THINKING=true

# 设置最大token数
DEEP_THINKING_MAX_TOKENS=2000
```

## 配置文件使用方法

### 1. 导入配置
```javascript
import { EDIT_CONFIG, THINKING_CONFIG, MESSAGE_TEMPLATES } from '../config/deepThinkingConfig.js';
```

### 2. 使用配置参数
```javascript
// 使用编辑配置
if (editCount < EDIT_CONFIG.MAX_EDIT_COUNT) {
  // 执行编辑操作
}

// 使用消息模板
const message = MESSAGE_TEMPLATES.THINKING_MESSAGE.replace('{content}', thinkingContent);
```

### 3. 自定义配置
如需自定义配置，建议：

1. **不要直接修改 `deepThinkingConfig.js`**
2. **创建环境特定的配置文件**
3. **使用环境变量覆盖默认值**

示例：
```javascript
// customConfig.js
import { DEFAULT_CONFIG } from './deepThinkingConfig.js';

export const CUSTOM_CONFIG = {
  ...DEFAULT_CONFIG,
  EDIT_CONFIG: {
    ...DEFAULT_CONFIG.EDIT_CONFIG,
    MAX_EDIT_COUNT: 18,  // 自定义编辑次数
  }
};
```

## 故障排除

### 常见问题

1. **编辑次数达到上限**
   - 检查 `MAX_EDIT_COUNT` 设置
   - 确认 `UPDATE_INTERVAL` 不至于过短

2. **思考过程更新不及时**
   - 减小 `UPDATE_INTERVAL` 值
   - 减小 `MIN_CONTENT_GROWTH` 阈值

3. **AI回复质量不佳**
   - 调整 `SYSTEM_PROMPT`
   - 增加 `MAX_THINKING_TIME`

### 调试技巧

1. **启用详细日志**：
   ```javascript
   MONITORING_CONFIG.LOG_LEVEL = 'DEBUG';
   ```

2. **监控编辑进度**：
   ```javascript
   MONITORING_CONFIG.SHOW_EDIT_PROGRESS = true;
   ```

3. **跟踪性能**：
   ```javascript
   MONITORING_CONFIG.TRACK_RESPONSE_TIME = true;
   ```

## 版本控制

配置文件的变更应该：
1. **记录在版本控制中**
2. **添加变更注释**
3. **测试不同配置的影响**
4. **逐步部署，避免激进变更**

## 扩展配置

如需添加新的配置项：

1. **在相应的配置模块中添加**
2. **更新此说明文档**
3. **在代码中使用新的配置参数**
4. **提供默认值和环境变量支持**

---

*最后更新：2025年10月30日*