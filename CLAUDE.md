# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is a modular Feishu (Lark) chatbot with Claude AI integration, built with Node.js and modern ES modules. The bot operates on an **at-least-once** event delivery strategy, ensuring reliable message processing while avoiding duplicate responses.

## Architecture Overview

### Core Design Principles

1. **At-Least-Once Event Processing**: Rapidly acknowledges events (returns HTTP 200) to prevent Feishu retries, while processing logic asynchronously
2. **Modular Architecture**: Clean separation of concerns with dedicated modules for different functionalities
3. **Queue-Based Processing**: Microtask queue system for reliable, non-blocking event handling
4. **Event Deduplication**: Supports both Feishu v1.0 (uuid) and v2.0 (event_id) deduplication mechanisms
5. **Dual AI Modes**: Standard mode and deep thinking mode with real-time thinking process display

### System Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Feishu Events │───▶│  Event Handler  │───▶│  Event Queue    │
│   (WebSocket)   │    │  (index_modular.js)│    │ (eventQueue.js) │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                                      │
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Message       │◀───│  Message        │◀───│  Queue         │
│   Response      │    │  Service        │    │  Processor     │
│   (async)       │    │ (messageService.js)│    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
            │                    │                    │
            ▼                    ▼                    ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Claude AI      │    │  Context        │    │ Event           │
│  Service        │    │  Service        │    │ Deduplicator    │
│ (claudeService.js)│  (contextService.js)│  (eventDeduplicator.js) │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Key Components

### Event Handler (`index_modular.js`)
- Main entry point and event dispatcher
- Rapid event acknowledgment (HTTP 200)
- Event deduplication check
- Event type detection and filtering
- Message parsing and validation
- Asynchronous queue processing

### Event Queue (`utils/eventQueue.js`)
- Microtask queue for reliable async processing
- Non-blocking event processing with error handling
- Immediate reply with timeout protection
- Message editing for AI thinking process display
- Queue status monitoring and backoff mechanisms

### Claude Service (`services/claudeService.js`)
- AI integration with standard and deep thinking modes
- Streaming responses for real-time thinking display
- Error handling with fallback to standard mode
- Configurable token limits and models via environment variables

### Message Service (`services/messageService.js`)
- Message sending and editing logic
- Support for p2p and group messages with thread awareness
- Rich text and interactive card formatting
- Multiple fallback strategies for message delivery

### Event Detector (`utils/eventDetector.js`)
- Determines if an event should be processed
- Private message detection and group @ mention detection
- Multiple bot identification methods with fallback strategies
- Text message filtering

## Event Processing Flow

1. **Event Receipt**: WebSocket receives message event
2. **Rapid Acknowledgment**: Handler immediately returns HTTP 200
3. **Event Deduplication**: Check for duplicate events (supports both v1.0 uuid and v2.0 event_id)
4. **Event Detection**: Determine if event should be processed (private messages or group @ mentions)
5. **Message Parsing**: Extract and validate message content
6. **Queue Addition**: Add event to async queue for processing
7. **Queue Processing**: Process event with immediate reply, context retrieval, and AI processing
8. **Response Delivery**: Send formatted response or edit existing thinking message

## Configuration Requirements

### Environment Variables:
```bash
# Feishu App Configuration
APP_ID=your_app_id
APP_SECRET=your_app_secret
BASE_DOMAIN=https://open.feishu.cn
APP_NAME=your_bot_name

# Bot Identification (for @ detection)
BOT_OPEN_ID=your_bot_open_id
BOT_USER_ID=your_bot_user_id

# Claude AI Configuration
ANTHROPIC_BASE_URL=your_claude_api_url
ANTHROPIC_AUTH_TOKEN=your_claude_api_token

# Optional: Deep Thinking Mode
ENABLE_DEEP_THINKING=true
DEEP_THINKING_MAX_TOKENS=2000
```

## Development Commands

```bash
# Install dependencies
npm install

# Test configuration and API connectivity
npm run test:env

# Start development server
npm run dev

# Test individual module functionality
node test_modules.js
```

## Event Types and Detection

### Processed Events:
- **Private Messages**: All p2p messages
- **Group Mentions**: Only messages @ mentioning the bot
- **Text Messages**: Only text message type (no images, files, etc.)

### Group @ Mention Detection Methods:
1. **Primary**: `open_id` matching
2. **Secondary**: `user_id` matching
3. **Fallback**: `name` matching (APP_NAME)
4. **Emergency**: Keyword matching (机器人, Bot, Assistant)
5. **Text**: Pattern matching `@_user_{APP_ID}`

## Error Handling

- **Queue Processing**: Error counting with backoff (max 10 errors, 30-second pause)
- **Message Sending**: 3-second timeout for immediate replies, multiple format fallbacks
- **Claude API**: Deep thinking mode falls back to standard mode on error
- **Event Deduplication**: 5-minute cache with automatic cleanup

## Performance Optimizations

- Non-blocking I/O with async/await
- Microtask queue using queueMicrotask
- Event deduplication caching
- Streaming responses for real-time AI thinking display
- Timeout protection for long-running operations
- Graceful shutdown handling

## Integration Points

### Feishu API:
- WebSocket events via `im.message.receive_v1`
- Message sending via `im.v1.message.create`
- Thread replies via `im.v1.message.reply`
- Message editing for real-time updates

### Claude API:
- Custom base URL and API key authentication
- Streaming responses for thinking process display
- Configurable model selection and token limits

## AI Modes

### Standard Mode:
- Direct AI responses without thinking process display
- Faster response times
- Suitable for simple queries and quick interactions

### Deep Thinking Mode:
- Shows AI's reasoning process in real-time
- Higher quality, more detailed responses
- Configurable via `ENABLE_DEEP_THINKING` environment variable
- Includes message editing to display thinking progress

The modular architecture allows for easy maintenance and extension of individual components while maintaining reliable event processing and excellent user experience.

## Configuration System

### Deep Thinking Configuration (`config/deepThinkingConfig.js`)
All deep thinking mode parameters are centralized in a comprehensive configuration system with 5 modules:

- **EDIT_CONFIG**: Controls message editing behavior (15 edits max, 1.5s intervals, punctuation triggers)
- **THINKING_CONFIG**: AI process settings (30s timeout, system prompts, message templates)
- **MESSAGE_TEMPLATES**: All UI text templates (thinking messages, prefixes, error messages)
- **ERROR_CONFIG**: Error handling strategies (Feishu error code 230072, retry policies)
- **MONITORING_CONFIG**: Logging and debugging controls

### Configuration Usage
```javascript
import { EDIT_CONFIG, MESSAGE_TEMPLATES } from '../config/deepThinkingConfig.js';
// Use EDIT_CONFIG.MAX_EDIT_COUNT for edit limits
// Use MESSAGE_TEMPLATES.THINKING_MESSAGE for UI text
```

Key constraints: Feishu allows 20 message edits, system uses 15 as safety margin. Deep thinking mode has 30-second timeout to prevent infinite processing.

## Development Commands

```bash
# Install dependencies
npm install

# Test environment configuration and API connectivity
npm run test:env

# Start development server (main entry point)
npm run dev

# Test individual module functionality
node test_modules.js

# Test configuration loading only
node test_config.js
```

## Critical Implementation Details

### Event Queue Processing
The at-least-once delivery strategy relies on immediate HTTP 200 responses followed by async queue processing. The queue (`utils/eventQueue.js`) handles:
- Sequential microtask processing via `queueMicrotask()`
- Error counting with backoff (max 10 errors, 30s pause)
- Context retrieval from Feishu thread history
- Immediate "thinking" replies with real-time editing

### AI Mode Switching
The system automatically switches between modes based on `ENABLE_DEEP_THINKING` environment variable:
- **Standard Mode**: Direct API call, faster response
- **Deep Thinking Mode**: Streaming response with real-time message editing, respects edit limits

### Message Editing Constraints
Feishu messages can be edited maximum 20 times. The system:
- Tracks edit count and stops at 15 edits (safety margin)
- Falls back to sending new messages when limit reached
- Updates every 1.5 seconds with 30+ character content growth
- Only updates on punctuation marks for natural breaks

### System Prompts Location
AI system prompts are defined in `config/deepThinkingConfig.js` in the `THINKING_CONFIG.SYSTEM_PROMPT` property. For deep thinking mode, the system prompt is combined with user messages since the Claude API implementation doesn't support separate system roles.