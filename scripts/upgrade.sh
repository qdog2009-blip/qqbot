#!/bin/bash
# QQBot 插件升级脚本
# 用于从 ClawdBot 迁移到 OpenClaw，自动保留配置

set -e

OPENCLAW_DIR="$HOME/.openclaw"
OPENCLAW_CONFIG="$OPENCLAW_DIR/openclaw.json"
CLAWDBOT_DIR="$HOME/.clawdbot"
CLAWDBOT_CONFIG="$CLAWDBOT_DIR/clawdbot.json"
EXTENSION_DIR="$OPENCLAW_DIR/extensions/qqbot"
PLUGIN_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== QQBot 插件升级脚本 ==="
echo ""

# 0. 从旧配置文件读取 AppID 和 AppSecret
APP_ID=""
CLIENT_SECRET=""
if [ -f "$CLAWDBOT_CONFIG" ]; then
  echo "从旧配置文件读取配置..."
  CREDENTIALS=$(node -e "
    const fs = require('fs');
    const config = JSON.parse(fs.readFileSync('$CLAWDBOT_CONFIG', 'utf8'));
    if (config.channels && config.channels.qqbot) {
      const qqbot = config.channels.qqbot;
      if (qqbot.accounts && qqbot.accounts.length > 0) {
        const account = qqbot.accounts[0];
        if (account.appId && account.clientSecret) {
          console.log(JSON.stringify({appId: account.appId, clientSecret: account.clientSecret}));
        }
      }
    }
  " 2>/dev/null || echo "")

  if [ -n "$CREDENTIALS" ]; then
    APP_ID=$(echo "$CREDENTIALS" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log(d.appId||'')")
    CLIENT_SECRET=$(echo "$CREDENTIALS" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log(d.clientSecret||'')")
    echo "  - AppID: ${APP_ID:0:10}..."
    echo "  - ClientSecret: ${CLIENT_SECRET:0:4}..."
  else
    echo "  未在旧配置中找到 qqbot 凭证"
  fi
else
  echo "  未找到旧配置文件: $CLAWDBOT_CONFIG"
fi
echo ""

# 1. 删除旧的扩展目录
if [ -d "$EXTENSION_DIR" ]; then
  echo "删除旧版本插件: $EXTENSION_DIR"
  rm -rf "$EXTENSION_DIR"
else
  echo "未找到旧版本插件目录，跳过删除"
fi
echo ""

# 2. 清理配置文件中的 qqbot 相关字段
if [ -f "$OPENCLAW_CONFIG" ]; then
  echo "清理配置文件中的 qqbot 字段..."
  node -e "
    const fs = require('fs');
    const config = JSON.parse(fs.readFileSync('$OPENCLAW_CONFIG', 'utf8'));

    if (config.channels && config.channels.qqbot) {
      delete config.channels.qqbot;
      console.log('  - 已删除 channels.qqbot');
    }
    if (config.plugins && config.plugins.entries && config.plugins.entries.qqbot) {
      delete config.plugins.entries.qqbot;
      console.log('  - 已删除 plugins.entries.qqbot');
    }
    if (config.plugins && config.plugins.installs && config.plugins.installs.qqbot) {
      delete config.plugins.installs.qqbot;
      console.log('  - 已删除 plugins.installs.qqbot');
    }

    fs.writeFileSync('$OPENCLAW_CONFIG', JSON.stringify(config, null, 2));
    console.log('配置文件已更新');
  "
else
  echo "未找到配置文件: $OPENCLAW_CONFIG"
fi
echo ""

# 3. 安装插件
echo "安装插件到 OpenClaw..."
cd "$PLUGIN_DIR"
openclaw plugins install .
echo ""

# 4. 配置 qqbot 通道
if [ -n "$APP_ID" ] && [ -n "$CLIENT_SECRET" ]; then
  echo "配置 qqbot 通道..."
  openclaw channels add --channel qqbot --token "$APP_ID:$CLIENT_SECRET"
  echo ""
else
  echo "跳过通道配置（缺少凭证）"
  echo "请手动执行: openclaw channels add --channel qqbot --token \"AppID:AppSecret\""
  echo ""
fi

# 5. 重启 gateway
echo "重启 OpenClaw gateway..."
openclaw gateway restart
echo ""

echo "=== 升级完成 ==="
