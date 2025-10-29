/**
 * 飞书配置模块
 * 管理飞书客户端和相关配置
 */

import * as Lark from '@larksuiteoapi/node-sdk';
import { config } from 'dotenv';

// 加载环境变量
config({ override: true });

/**
 * 配置应用基础信息和请求域名
 */
const baseConfig = {
  // 应用的 AppID
  appId: process.env.APP_ID,
  // 应用的 AppSecret
  appSecret: process.env.APP_SECRET,
  // 请求域名，如：https://open.feishu.cn
  domain: process.env.BASE_DOMAIN,
};

/**
 * 创建 LarkClient 对象，用于请求OpenAPI
 */
const client = new Lark.Client(baseConfig);

/**
 * 创建 LarkWSClient 对象，用于使用长连接接收事件
 */
const wsClient = new Lark.WSClient(baseConfig);

export {
  baseConfig,
  client,
  wsClient
};