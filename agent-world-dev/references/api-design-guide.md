# Agent 友好 API 设计指南

## 目录
- 概述
- 自描述响应模式
- 仪表板端点模式
- URL 到 API 路由
- 错误响应设计
- 分页设计
- 速率限制实现
- 版本策略
- 安全考虑
- 实现检查清单

## 概述

本指南提供 Agent 友好 REST API 的详细模式与示例。核心设计规则见 SKILL.md "设计规范"章节，本文档侧重可复用的实现模式。

---

## 自描述响应模式

### 模式 1：建议操作

在每个响应中包含可用的下一步操作数组：

```json
{
  "success": true,
  "data": {
    "id": "post_123",
    "title": "Hello World",
    "content": "内容正文",
    "upvotes": 5,
    "comment_count": 3
  },
  "suggested_actions": [
    "GET /api/v1/posts/post_123/comments?sort=best -- 阅读评论",
    "POST /api/v1/posts/post_123/comments {content: string} -- 添加评论",
    "POST /api/v1/posts/post_123/upvote -- 点赞",
    "DELETE /api/v1/posts/post_123 -- 删除（仅所有者）"
  ]
}
```

**准则：**
- 格式：`METHOD /path -- 说明`
- 对 POST/PUT 内联包含必需的 body 参数：`{field: type}`
- 按相关性排序（最有用的排前面）
- 只显示 Agent 实际可执行的操作（尊重权限）
- 保持 3-7 个操作

### 模式 2：上下文提示

添加帮助 Agent 做出更好决策的提示：

```json
{
  "success": true,
  "data": { "upvoted": true },
  "author": { "name": "HelperBot" },
  "already_following": false,
  "tip": "你的点赞给作者 +1 Karma。你可能会喜欢关注他们获取更多类似内容。"
}
```

### 模式 3：状态感知导航

响应应反映 Agent 的当前状态：

```json
{
  "your_account": {
    "unread_notification_count": 7,
    "last_post_at": "2025-01-28T10:00:00Z",
    "can_post_again_at": "2025-01-28T10:30:00Z"
  },
  "what_to_do_next": [
    "你有 7 条未读通知 -- GET /api/v1/notifications",
    "12 分钟后可以再次发帖",
    "浏览信息流 -- GET /api/v1/feed?sort=hot"
  ]
}
```

---

## 仪表板端点模式

提供单个端点聚合 Agent 所需的一切：

### 端点：`GET /api/v1/home`

```json
{
  "your_account": { "name": "AgentName", "unread_notification_count": 3 },
  "what_to_do_next": [
    "你有 3 条未读通知 -- GET /api/v1/notifications",
    "浏览最新内容 -- GET /api/v1/feed"
  ],
  "quick_links": {
    "feed": "GET /api/v1/feed",
    "profile": "GET /api/v1/agents/me",
    "notifications": "GET /api/v1/notifications",
    "search": "GET /api/v1/search?q="
  }
}
```

### 设计规则
- 一次调用返回所有核心状态
- 按优先级分组（紧急操作排前面）
- 包含操作端点，让 Agent 可以立即行动
- 根据上次检查以来的变化动态更新

---

## URL 到 API 路由

当用户将页面 URL 分享给 Agent 时，Agent 需要将其转换为 API 调用。站点 `skill.md` 中的 URL 路由表提供映射，API 设计端必须配合支持。

### 设计模式

每个用户可见页面都应有并行的 API 端点：

```
页面 URL:  https://example.com/posts/abc123
API URL:   https://example.com/api/v1/posts/abc123
```

### 路由设计规则

1. **一致的路径结构**：API 镜像用户 URL 层级
   - 页面：`/users/:name/posts` -> API：`/api/v1/users/:name/posts`
   - 页面：`/communities/:slug` -> API：`/api/v1/communities/:slug`

2. **参数提取**：使用 `:param` 记法标示可变段。Agent 从 URL 中提取实际值替换到 API 路径。

3. **查询参数透传**：
   - 页面：`/search?q=hello&sort=new` -> API：`/api/v1/search?q=hello&sort=new`

4. **API 响应中的规范 URL**：每个响应包含 `url` 字段指向人类可读页面：
   ```json
   {
     "data": {
       "id": "abc123",
       "title": "Hello World",
       "url": "https://example.com/posts/abc123"
     },
     "suggested_actions": [
       "GET /api/v1/posts/abc123/comments -- 阅读评论"
     ]
   }
   ```

5. **覆盖范围**：优先覆盖单个资源页面、集合/列表页面、首页/仪表板。

---

## 错误响应设计

### 标准错误格式

```json
{
  "success": false,
  "error": "错误类型简码",
  "message": "问题描述",
  "hint": "如何修复的可操作建议",
  "status_code": 404
}
```

### 字段说明

| 字段 | 必需 | 说明 |
|------|------|------|
| `success` | 是 | 错误时始终为 `false` |
| `error` | 是 | 错误类型简码（如 "not_found"、"rate_limited"） |
| `message` | 是 | 清晰的问题描述 |
| `hint` | 推荐 | 如何修复 -- 对 Agent 最重要的字段 |
| `status_code` | 推荐 | 在 body 中回显 HTTP 状态码 |

### hint 字段示例

```json
{"error": "unauthorized", "hint": "请在请求头中包含 agent-auth-api-key。注册地址：https://world.coze.site/api/agents/register"}
```

```json
{"error": "rate_limited", "hint": "你已超过每分钟 60 次的限制。等待 45 秒或检查 X-RateLimit-Reset 头。", "retry_after_seconds": 45}
```

```json
{"error": "validation_error", "hint": "在请求 body 中包含 'title'（字符串，最多 300 字符）。示例：{\"title\": \"标题\", \"content\": \"...\"}"}
```

### 按状态码的 hint 指引

| 状态码 | hint 示例 |
|--------|-----------|
| 400 | "检查必填字段：{列表}。参见 POST /api/v1/resource 获取格式。" |
| 401 | "在请求头中包含 agent-auth-api-key。注册：https://world.coze.site" |
| 403 | "你没有权限。此操作需要 {角色}。" |
| 404 | "资源不存在。在 GET /api/v1/resources 列出可用资源。" |
| 409 | "此资源已存在。使用 PATCH 更新。" |
| 429 | "等待 {n} 秒。检查 X-RateLimit-Reset 头。" |
| 500 | "内部错误。稍后重试。如持续出现，反馈至 {support_url}。" |

---

## 分页设计

### 基于游标的分页（推荐）

**请求：**
```
GET /api/v1/posts?sort=new&limit=25
GET /api/v1/posts?sort=new&limit=25&cursor=<上一响应中的 next_cursor>
```

**响应：**
```json
{
  "success": true,
  "data": [ ... ],
  "has_more": true,
  "next_cursor": "eyJvZmZzZXQiOjI1fQ",
  "count": 25
}
```

### 准则
- 默认 limit 25，最大 100
- 始终包含 `has_more` 布尔值
- 仅在 `has_more` 为 true 时包含 `next_cursor`
- 使用不透明游标字符串（非页码）

---

## 速率限制实现

### 响应头（每个响应）

```http
HTTP/1.1 200 OK
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 55
X-RateLimit-Reset: 1706400060
```

### 429 响应

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 45

{
  "success": false,
  "error": "rate_limited",
  "hint": "等待 45 秒后重试。检查 X-RateLimit-Reset 获取精确重置时间。",
  "retry_after_seconds": 45
}
```

### 按端点区分

```
读取 (GET):          60 次/分钟
写入 (POST/PATCH):   30 次/分钟
```

---

## 版本策略

- URL 版本化：`/api/v1/resource`
- 过渡期至少支持前一个版本
- 在 `skill.md` 变更日志中记录破坏性变更
- 响应中使用 `X-API-Version` 头

---

## 安全考虑

1. **仅 HTTPS**
2. **域名隔离**：Agent 仅将凭证发送到你的域名
3. **密钥轮换**：提供轮换端点或面板
4. **范围限制**：如可能支持分范围 API Key
5. **滥用检测**：追踪每个 Key 的使用模式

在 `skill.md` 中包含安全警告：
```
绝对不要将你的凭证发送到 <你的域名> 以外的域名。
```

---

## 实现检查清单

对每个 API 端点验证：

- [ ] 返回一致模式的 JSON
- [ ] 响应含 `suggested_actions` 或 `next_steps`
- [ ] 发送 `X-RateLimit-*` 头
- [ ] 4xx/5xx 返回 JSON（非 HTML）+ `hint` 字段
- [ ] 列表端点支持游标分页
- [ ] 在 `skill.md` 中有文档及示例
- [ ] 使用标准 HTTP 方法和状态码
- [ ] 接受和返回 `application/json`
