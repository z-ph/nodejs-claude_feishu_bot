#!/usr/bin/env node
/**
 * 配置测试脚��
 * 验证环境变量是否正确设置，并测试 Claude API 连接
 */

import Anthropic from '@anthropic-ai/sdk';
import { config } from 'dotenv';

// 加载环境变量
config({ override: true });

async function testConfiguration() {
  console.log('🔍 开始检查配置...');

  // 检查飞书配置
  console.log('\n📋 飞书配置检查:');
  const appId = process.env.APP_ID;
  const appSecret = process.env.APP_SECRET;
  const baseDomain = process.env.BASE_DOMAIN;

  if (appId) {
    console.log(`   ✅ APP_ID: ${appId.length > 10 ? appId.substring(0, 10) + '...' : appId}`);
  } else {
    console.log('   ❌ APP_ID: 未设置');
  }

  if (appSecret) {
    console.log(`   ✅ APP_SECRET: ${appSecret.length > 10 ? appSecret.substring(0, 10) + '...' : '已设置'}`);
  } else {
    console.log('   ❌ APP_SECRET: 未设置');
  }

  if (baseDomain) {
    console.log(`   ✅ BASE_DOMAIN: ${baseDomain}`);
  } else {
    console.log('   ❌ BASE_DOMAIN: 未设置');
  }

  // 检查 Claude 配置
  console.log('\n🤖 Claude 配置检查:');
  const anthropicBaseUrl = process.env.ANTHROPIC_BASE_URL;
  const anthropicAuthToken = process.env.ANTHROPIC_AUTH_TOKEN;

  if (anthropicBaseUrl) {
    console.log(`   ✅ ANTHROPIC_BASE_URL: ${anthropicBaseUrl}`);
  } else {
    console.log('   ❌ ANTHROPIC_BASE_URL: 未设置');
  }

  if (anthropicAuthToken) {
    console.log(`   ✅ ANTHROPIC_AUTH_TOKEN: ${anthropicAuthToken.length > 20 ? anthropicAuthToken.substring(0, 20) + '...' : '已设置'}`);
  } else {
    console.log('   ❌ ANTHROPIC_AUTH_TOKEN: 未设置');
  }

  // 测试 Claude API 连接
  console.log('\n🔌 测试 Claude API 连接:');
  if (anthropicBaseUrl && anthropicAuthToken) {
    try {
      const client = new Anthropic({
        apiKey: anthropicAuthToken,
        baseURL: anthropicBaseUrl,
      });

      // 发送一个简单的测试请求
      const response = await client.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 10,
        messages: [
          { role: 'user', content: 'Hello' }
        ]
      });

      console.log('   ✅ Claude API 连接成功');
      console.log(`   📝 测试回复: ${response.content[0].text}`);

    } catch (error) {
      console.log(`   ❌ Claude API 连接失败: ${error.message}`);
    }
  } else {
    console.log('   ⚠️  跳过 Claude API 测试（配置不完整）');
  }

  console.log('\n🎯 配置检查完成！');
}

// 运行测试
testConfiguration().catch(console.error);