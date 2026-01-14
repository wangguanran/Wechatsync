# 文章同步助手

一键同步文章到知乎、头条、掘金等 20+ 平台，支持 WordPress 等自建站。

## 功能特性

- **多平台同步**: 支持知乎、掘金、头条、CSDN、简书、微博、B站专栏等 20+ 平台
- **自建站支持**: WordPress、Typecho、MetaWeblog API
- **智能提取**: 自动从网页提取文章标题、内容、封面图
- **图片上传**: 自动上传文章图片到目标平台
- **草稿模式**: 同步后保存为草稿，方便二次编辑
- **MCP 集成**: 支持 Claude Code 通过 MCP 协议调用

## 项目结构

```
Wechatsync/
├── packages/
│   ├── extension/     # Chrome 扩展 (MV3)
│   ├── mcp-server/    # MCP Server (stdio/SSE)
│   └── core/          # 核心逻辑 (共享)
```

## 快速开始

### 安装扩展

```bash
# 在项目根目录
yarn install
yarn build
```

然后在 Chrome 中加载 `packages/extension/dist` 目录。

## 支持的平台

| 平台 | ID | 状态 |
|-----|-----|-----|
| 知乎 | zhihu | ✅ |
| 掘金 | juejin | ✅ |
| 头条号 | toutiao | ✅ |
| CSDN | csdn | ✅ |
| 简书 | jianshu | ✅ |
| 微博 | weibo | ✅ |
| B站专栏 | bilibili | ✅ |
| 百家号 | baijiahao | ✅ |
| 语雀 | yuque | ✅ |
| 豆瓣 | douban | ✅ |
| 搜狐号 | sohu | ✅ |
| 雪球 | xueqiu | ✅ |
| 人人都是产品经理 | woshipm | ✅ |
| 大鱼号 | dayu | ✅ |
| WordPress | wordpress | ✅ |
| Typecho | typecho | ✅ |

## Claude Code 集成

通过 MCP 协议，可以在 Claude Code 中直接使用文章同步助手。

### 配置步骤

1. 构建项目: `yarn build`
2. 在 Chrome 扩展设置中启用「MCP 连接」，并设置 Token
3. 在 `~/.claude/claude_desktop_config.json` 中添加配置：

```json
{
  "mcpServers": {
    "sync-assistant": {
      "command": "node",
      "args": ["/path/to/Wechatsync/packages/mcp-server/dist/index.js"],
      "env": {
        "MCP_TOKEN": "your-secret-token-here"
      }
    }
  }
}
```

**重要**: `MCP_TOKEN` 必须与 Chrome 扩展中设置的 Token 一致。

### 使用示例

在 Claude Code 中直接对话：

```
"帮我把这篇文章同步到知乎和掘金"
"检查下哪些平台已登录"
"上传 /path/to/image.png 到微博图床"
```

### 可用工具

| 工具 | 说明 |
|-----|------|
| `list_platforms` | 列出所有平台及登录状态 |
| `check_auth` | 检查指定平台登录状态 |
| `sync_article` | 同步文章到指定平台（草稿） |
| `extract_article` | 从当前浏览器页面提取文章 |
| `upload_image_file` | 上传本地图片到平台 |

详细文档见 [packages/mcp-server/README.md](packages/mcp-server/README.md)

## 开发

```bash
# 开发模式
yarn dev

# 构建
yarn build
```

## License

GPL-3.0
