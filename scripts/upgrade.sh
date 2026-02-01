#!/bin/bash
# QQBot 插件升级脚本
# 用于清理旧版本插件并重新安装

set -e

CLAWDBOT_DIR="$HOME/.clawdbot"
CONFIG_FILE="$CLAWDBOT_DIR/clawdbot.json"
EXTENSION_DIR="$CLAWDBOT_DIR/extensions/qqbot"

echo "=== QQBot 插件升级脚本 ==="

# 1. 删除旧的扩展目录
if [ -d "$EXTENSION_DIR" ]; then
  echo "删除旧版本插件: $EXTENSION_DIR"
  rm -rf "$EXTENSION_DIR"
else
  echo "未找到旧版本插件目录，跳过删除"
fi

# 2. 清理配置文件中的 qqbot 相关字段
if [ -f "$CONFIG_FILE" ]; then
  echo "清理配置文件中的 qqbot 字段..."
  
  # 使用 node 处理 JSON（比 jq 更可靠处理复杂结构）
  node -e "
    const fs = require('fs');
    const config = JSON.parse(fs.readFileSync('$CONFIG_FILE', 'utf8'));
    
    // 删除 channels.qqbot
    if (config.channels && config.channels.qqbot) {
      delete config.channels.qqbot;
      console.log('  - 已删除 channels.qqbot');
    }
    
    // 删除 plugins.entries.qqbot
    if (config.plugins && config.plugins.entries && config.plugins.entries.qqbot) {
      delete config.plugins.entries.qqbot;
      console.log('  - 已删除 plugins.entries.qqbot');
    }
    
    // 删除 plugins.installs.qqbot
    if (config.plugins && config.plugins.installs && config.plugins.installs.qqbot) {
      delete config.plugins.installs.qqbot;
      console.log('  - 已删除 plugins.installs.qqbot');
    }
    
    fs.writeFileSync('$CONFIG_FILE', JSON.stringify(config, null, 2));
    console.log('配置文件已更新');
  "
else
  echo "未找到配置文件: $CONFIG_FILE"
fi

echo ""
echo "=== 清理完成 ==="
echo ""
echo "接下来请执行以下命令重新安装插件:"
echo "  cd /path/to/qqbot"
echo "  clawdbot plugins install ."
echo "  clawdbot channels add --channel qqbot --token \"AppID:AppSecret\""
echo "  clawdbot gateway restart"
