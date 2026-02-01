/**
 * QQ Bot API 鉴权和请求封装
 */

const API_BASE = "https://api.sgroup.qq.com";
const TOKEN_URL = "https://bots.qq.com/app/getAppAccessToken";

let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * 获取 AccessToken（带缓存）
 */
export async function getAccessToken(appId: string, clientSecret: string): Promise<string> {
  // 检查缓存，提前 5 分钟刷新
  if (cachedToken && Date.now() < cachedToken.expiresAt - 5 * 60 * 1000) {
    return cachedToken.token;
  }

  let response: Response;
  try {
    response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appId, clientSecret }),
    });
  } catch (err) {
    throw new Error(`Network error getting access_token: ${err instanceof Error ? err.message : String(err)}`);
  }

  let data: { access_token?: string; expires_in?: number };
  try {
    data = (await response.json()) as { access_token?: string; expires_in?: number };
  } catch (err) {
    throw new Error(`Failed to parse access_token response: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!data.access_token) {
    throw new Error(`Failed to get access_token: ${JSON.stringify(data)}`);
  }

  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 7200) * 1000,
  };

  return cachedToken.token;
}

/**
 * 清除 Token 缓存
 */
export function clearTokenCache(): void {
  cachedToken = null;
}

/**
 * msg_seq 追踪器 - 用于对同一条消息的多次回复
 * key: msg_id, value: 当前 seq 值
 */
const msgSeqTracker = new Map<string, number>();

/**
 * 获取并递增消息序号
 */
export function getNextMsgSeq(msgId: string): number {
  const current = msgSeqTracker.get(msgId) ?? 0;
  const next = current + 1;
  msgSeqTracker.set(msgId, next);
  
  // 清理过期的序号（超过 5 次或 60 分钟后无意义）
  // 简单策略：保留最近 1000 条
  if (msgSeqTracker.size > 1000) {
    const keys = Array.from(msgSeqTracker.keys());
    for (let i = 0; i < 500; i++) {
      msgSeqTracker.delete(keys[i]);
    }
  }
  
  return next;
}

/**
 * API 请求封装
 */
export async function apiRequest<T = unknown>(
  accessToken: string,
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const url = `${API_BASE}${path}`;
  const options: RequestInit = {
    method,
    headers: {
      Authorization: `QQBot ${accessToken}`,
      "Content-Type": "application/json",
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  let res: Response;
  try {
    res = await fetch(url, options);
  } catch (err) {
    throw new Error(`Network error [${path}]: ${err instanceof Error ? err.message : String(err)}`);
  }

  let data: T;
  try {
    data = (await res.json()) as T;
  } catch (err) {
    throw new Error(`Failed to parse response [${path}]: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!res.ok) {
    const error = data as { message?: string; code?: number };
    throw new Error(`API Error [${path}]: ${error.message ?? JSON.stringify(data)}`);
  }

  return data;
}

/**
 * 获取 WebSocket Gateway URL
 */
export async function getGatewayUrl(accessToken: string): Promise<string> {
  const data = await apiRequest<{ url: string }>(accessToken, "GET", "/gateway");
  return data.url;
}

/**
 * 发送 C2C 单聊消息
 */
export async function sendC2CMessage(
  accessToken: string,
  openid: string,
  content: string,
  msgId?: string
): Promise<{ id: string; timestamp: number }> {
  const msgSeq = msgId ? getNextMsgSeq(msgId) : 1;
  return apiRequest(accessToken, "POST", `/v2/users/${openid}/messages`, {
    content,
    msg_type: 0,
    msg_seq: msgSeq,
    ...(msgId ? { msg_id: msgId } : {}),
  });
}

/**
 * 发送频道消息
 */
export async function sendChannelMessage(
  accessToken: string,
  channelId: string,
  content: string,
  msgId?: string
): Promise<{ id: string; timestamp: string }> {
  return apiRequest(accessToken, "POST", `/channels/${channelId}/messages`, {
    content,
    ...(msgId ? { msg_id: msgId } : {}),
  });
}

/**
 * 发送群聊消息
 */
export async function sendGroupMessage(
  accessToken: string,
  groupOpenid: string,
  content: string,
  msgId?: string
): Promise<{ id: string; timestamp: string }> {
  const msgSeq = msgId ? getNextMsgSeq(msgId) : 1;
  return apiRequest(accessToken, "POST", `/v2/groups/${groupOpenid}/messages`, {
    content,
    msg_type: 0,
    msg_seq: msgSeq,
    ...(msgId ? { msg_id: msgId } : {}),
  });
}

/**
 * 主动发送 C2C 单聊消息（不需要 msg_id，每月限 4 条/用户）
 */
export async function sendProactiveC2CMessage(
  accessToken: string,
  openid: string,
  content: string
): Promise<{ id: string; timestamp: number }> {
  return apiRequest(accessToken, "POST", `/v2/users/${openid}/messages`, {
    content,
    msg_type: 0,
  });
}

/**
 * 主动发送群聊消息（不需要 msg_id，每月限 4 条/群）
 */
export async function sendProactiveGroupMessage(
  accessToken: string,
  groupOpenid: string,
  content: string
): Promise<{ id: string; timestamp: string }> {
  return apiRequest(accessToken, "POST", `/v2/groups/${groupOpenid}/messages`, {
    content,
    msg_type: 0,
  });
}

/**
 * 上传图片获取 UUID
 * QQ Bot 需要先上传图片，返回 uuid 后再发送消息
 */
export async function uploadImage(
  accessToken: string,
  imageData: string
): Promise<string> {
  // 支持 base64 或 URL
  let payload: { url?: string; file_data?: string };
  
  if (imageData.startsWith("http")) {
    payload = { url: imageData };
  } else if (imageData.startsWith("data:")) {
    payload = { file_data: imageData.split(",")[1] };
  } else {
    // 假设是 base64
    payload = { file_data: imageData };
  }

  const data = await apiRequest<{ id: string }>(
    accessToken,
    "POST",
    "/v2/assets",
    payload
  );
  
  return data.id;
}

/**
 * 发送 C2C 图片消息
 */
export async function sendC2CImageMessage(
  accessToken: string,
  openid: string,
  imageUuid: string
): Promise<{ id: string; timestamp: number }> {
  const msgSeq = 1;
  return apiRequest(accessToken, "POST", `/v2/users/${openid}/messages`, {
    msg_type: 7, // 图片消息类型
    msg_seq: msgSeq,
    content: JSON.stringify({
      1: { 1: imageUuid },
    }),
  });
}

/**
 * 发送频道图片消息
 */
export async function sendChannelImageMessage(
  accessToken: string,
  channelId: string,
  imageUuid: string
): Promise<{ id: string; timestamp: string }> {
  return apiRequest(accessToken, "POST", `/channels/${channelId}/messages`, {
    msg_id: "",
    content: JSON.stringify([
      { type: 7, data: { file: imageUuid } },
    ]),
  });
}

/**
 * 发送群聊图片消息
 */
export async function sendGroupImageMessage(
  accessToken: string,
  groupOpenid: string,
  imageUuid: string
): Promise<{ id: string; timestamp: string }> {
  const msgSeq = 1;
  return apiRequest(accessToken, "POST", `/v2/groups/${groupOpenid}/messages`, {
    msg_type: 7, // 图片消息类型
    msg_seq: msgSeq,
    content: JSON.stringify({
      1: { 1: imageUuid },
    }),
  });
}
