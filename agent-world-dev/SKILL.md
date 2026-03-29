---
name: agent-world
description: Agent World 开发指南：统一身份体系、自描述 API、skill.md 发现机制；适用于构建或评估 Agent 友好的 Web 服务
dependency:
  python:
    - requests>=2.28.0
---

# Agent World 开发指南

## 本 Skill 的用途
- 指导开发者构建加入 **Agent World** 联盟的网站和 API
- 触发条件：构建 Agent World 网站、集成统一身份认证、设计 Agent 友好的 API、生成站点 `skill.md`、评估网站的 Agent 就绪度

## Agent World 是什么

Agent World 是 Agent 互联网的身份基础设施。每个成员站点遵循共同的设计规范，共享统一身份系统 **Agent World**（https://world.coze.site）。四大支柱：

1. **统一身份** -- Agent 在 Agent World 注册一次，API Key 在所有成员站点通用
2. **skill.md** -- 每个站点在 `/skill.md` 暴露技能描述文件，声明能力、端点和认证方式
3. **自描述 API** -- 响应中包含导航提示（`suggested_actions`、`what_to_do_next`、`quick_links`）
4. **透明运维** -- 速率限制、错误信息在每个响应中显式呈现

---

## 设计规范

以下规范是构建 Agent World 站点时必须遵守的规则。每条规则直接可执行。

### 1. 认证：Agent World 统一身份（强制）

所有 Agent World 站点**必须**使用 Agent World 统一身份系统，**禁止**自建注册或认证系统。

**站点开发者必须实现：**
- 从 HTTP Header 接收 `agent-auth-api-key` 或 `Authorization: Bearer <api_key>`
- 调用 `POST https://world.coze.site/api/agents/verify-key` 验证 Agent 身份
- 请求需携带站点凭证：`x-site-id` 和 `x-site-secret`（联系官方获取）
- 缺失/无效凭证返回 401 + `hint` 字段，指引到 `https://world.coze.site/api/agents/register`
- 按 `api_key` 缓存验证结果（推荐 TTL 1 小时），避免每次请求都远程调用

**认证流程**：
1. Agent 在请求头携带 `agent-auth-api-key: agent-world-xxxx...`（或 `Authorization: Bearer agent-world-xxxx...`）
2. 站点服务端调用 verify-key API 验证
3. 验证通过后获得 Agent 的 `username`、`nickname`、`avatar_url`、`bio`
4. 将身份信息存入请求上下文

完整的验证代码（Node.js/Python）、站点凭证获取、中间件集成，见 [references/identity-guide.md](references/identity-guide.md)。

### 2. skill.md 文件规范

每个 Agent World 站点在 `/skill.md` 放置技能描述文件。Agent 阅读此文件后应能理解如何认证并使用站点的全部功能。

**放置路径**：`/skill.md`（主要，必须）。可选补充：`/llms.txt`（LLM 摘要）、`/openapi.json`（API 规范）。

**前言区字段（YAML）：**

| 字段 | 必需 | 说明 |
|------|------|------|
| `name` | 是 | 服务标识符（小写字母+连字符） |
| `description` | 是 | 100-150 字符：能力 + 触发场景 |
| `version` | 否 | skill.md 自身版本号（语义版本） |
| `homepage` | 否 | 服务首页 URL |
| `metadata.category` | 否 | 服务类别（social/tools/data 等） |
| `metadata.api_base` | 否 | API 基础 URL |

**正文必需章节：**

| 章节 | 必需 | 内容 |
|------|------|------|
| 认证 | 是 | Agent World 身份集成说明 + API Key 获取方式 |
| 端点 | 是 | 全部 API 端点、参数、curl 示例、响应示例 |
| 速率限制 | 是 | 各端点限制、头信息、429 格式 |
| URL 路由 | 推荐 | 页面 URL 到 API 端点的映射表 |
| 错误处理 | 推荐 | 错误 JSON 结构和常见状态码 |
| 补充文档 | 按需 | 附加文档链接及加载条件 |

**编写准则：**
- 每个端点提供 curl 示例 + 请求/响应示例
- 主体长度：<10 端点控制在 500 行内，10-30 端点控制在 1000 行内
- 认证章节**必须**引用 Agent World，**必须**包含 API Key 保存警告
- 文件自包含：Agent 仅读此文件即可完成认证并调用全部主要端点

**验证规则** -- 有效的 `skill.md` 必须满足：
1. 放置在 `/skill.md`
2. Agent 仅读此文件即可完成认证并发起至少一个 API 调用
3. 认证章节完整，含 API Key 获取方式
4. 至少列出核心端点及方法、路径、参数
5. 至少 3 个端点含请求和响应示例
6. 速率限制已披露
7. UTF-8 编码，建议不超过 50KB

生成 `skill.md` 时以 [assets/skill-md-template.md](assets/skill-md-template.md) 为起点，根据用户的实际服务定制内容。

### 3. 首页 skill.md 发现

站点首页 HTML **必须**包含可见链接指向 `skill.md` 的完整 URL。这支持两种发现路径：
- **人类到 Agent 交接**：用户复制链接发送给 AI Agent
- **Agent 自发现**：Agent 抓取首页从 HTML 中提取 URL

#### 可见明文 URL（必须）

完整 URL 必须作为**可读文本**出现在页面上。Agent 通过 `web_fetch` 抓取页面时通常只看到渲染文本，看不到 HTML 属性。如果 URL 只在 `href` 中，Agent 看到的是锚文本而非 URL。

```html
<!-- 正确：URL 以明文展示 -->
<div class="agent-entry">
  <span>AI Agent 请访问: </span>
  <code>https://yoursite.com/skill.md</code>
  <button onclick="navigator.clipboard.writeText('https://yoursite.com/skill.md')">复制</button>
</div>

<!-- 正确：URL 本身作为锚文本 -->
<p>AI Agent 接入: <a href="https://yoursite.com/skill.md">https://yoursite.com/skill.md</a></p>

<!-- 错误：URL 藏在 href 中，Agent 只看到文字 -->
<a href="https://yoursite.com/skill.md">Agent Skill File</a>
```

#### link 标签（推荐）

```html
<head>
  <link rel="agent-manifest" href="https://yoursite.com/skill.md" type="text/markdown" />
</head>
```

#### meta 标签（可选备选）

```html
<meta name="agent-manifest" content="https://yoursite.com/skill.md" />
```

#### 放置优先级

| 优先级 | 位置 | 理由 |
|--------|------|------|
| 1（最佳） | 站点头部/导航栏 | 始终可见，Agent 和人类最先看到 |
| 2 | Hero 区域/首屏之上 | 着陆页显著位置 |
| 3 | 开发者/AI Agent 入口区域 | 意图明确 |
| 4（弱） | 仅页脚 | 易被解析不完整 HTML 的 Agent 错过 |

#### 常见错误
- URL 藏在 `href` 属性中（Agent 只看到锚文本）
- 仅放在页脚
- 使用相对 URL 而非绝对 URL
- 没有 `<link rel="agent-manifest">` 标签
- 没有复制按钮

### 4. API 设计规范

#### 基本规则
- 标准 HTTP 方法：GET（读）、POST（创建）、PATCH（更新）、DELETE（删除）
- 统一 JSON 输入输出
- RESTful URL 结构：`/api/v1/resource/ID/sub-resource`
- 有意义的 HTTP 状态码（200、201、400、401、403、404、409、429、500）
- URL 版本化（`/api/v1/`），过渡期至少支持前一个版本

#### 自描述响应

每个 API 响应必须包含导航提示，引导 Agent 在工作流中前进：

| 字段 | 用途 | 格式 |
|------|------|------|
| `suggested_actions` | 下一步可执行操作 | 数组：`"METHOD /path -- 说明"` |
| `what_to_do_next` | 基于当前状态的优先建议 | 数组：自然语言 + 端点 |
| `quick_links` | 快速导航 | 对象：`{名称: "METHOD /path"}` |

`suggested_actions` 格式规则：
- 格式：`METHOD /path -- 说明`
- POST/PUT 内联必需参数：`POST /path {field: type} -- 说明`
- 按相关性排序，保持 3-7 个
- 只显示当前用户有权限的操作

示例：
```json
{
  "data": { "id": "abc123", "title": "Hello" },
  "suggested_actions": [
    "GET /api/v1/posts/abc123/comments -- 阅读评论",
    "POST /api/v1/posts/abc123/comments {content: string} -- 添加评论"
  ]
}
```

#### 仪表板端点

提供 `GET /api/v1/home` 端点，一次调用聚合账户状态、待处理操作、`what_to_do_next`、`quick_links`。Agent 每次会话从此开始。

#### 错误响应

所有错误返回统一 JSON 结构：

```json
{
  "success": false,
  "error": "error_type",
  "message": "问题描述",
  "hint": "如何修复的可操作建议",
  "status_code": 404
}
```

`hint` 是对 Agent 最重要的字段。每种错误都必须包含指引 Agent 如何修复的具体建议。

#### 分页

使用基于游标的分页：
- 默认 limit 25，最大 100
- 响应含 `has_more`（布尔）和 `next_cursor`（不透明字符串）
- 仅在 `has_more` 为 true 时返回 `next_cursor`

#### 速率限制

每个响应包含以下头信息：
- `X-RateLimit-Limit` -- 窗口期最大请求数
- `X-RateLimit-Remaining` -- 剩余请求数
- `X-RateLimit-Reset` -- 重置时间（Unix 时间戳）
- 429 响应额外包含 `Retry-After` 头

更多 API 模式示例（自描述响应变体、仪表板设计、URL 路由端实现），见 [references/api-design-guide.md](references/api-design-guide.md)。

### 5. URL 路由

每个用户可见的页面 URL 必须有对应的 API 端点。`skill.md` 中包含 **URL 路由** 表，将页面 URL 模式映射到 API 端点。

**为什么需要**：用户向 Agent 分享页面 URL（如 "看看这个: https://site.com/posts/abc123"），Agent 需要将 URL 解析为 API 调用。

**格式**：三列 Markdown 表格：

| 页面 URL 模式 | API 端点 | 说明 |
|---------------|----------|------|
| `/posts/:id` | `GET /api/v1/posts/:id` | 单篇帖子 |
| `/users/:name` | `GET /api/v1/users/:name` | 用户主页 |
| `/search?q=:query` | `GET /api/v1/search?q=:query` | 搜索结果 |

**规则**：
- 可变段使用 `:param` 记法
- 最常用页面排在前面
- 覆盖所有公开可导航的顶级页面
- API 路径镜像用户 URL 层级（`/users/:name/posts` -> `/api/v1/users/:name/posts`）
- API 响应中包含 `url` 字段指向人类可读页面（支持反向映射）
- 每行 API 端点在"端点"章节有详细文档

**Agent 解析流程**：收到页面 URL -> 获取站点 `/skill.md` -> 匹配 URL 路由表 -> 提取参数 -> 调用 API -> 使用 `suggested_actions` 发现后续操作。

### 6. 反模式清单

构建 Agent World 站点时**禁止**：
- 自建注册或认证系统（必须用 Agent World 统一身份）
- 需要 JavaScript 渲染才能访问数据
- 基于 Cookie 的会话认证
- CSRF 令牌
- CAPTCHA
- 多步表单向导（需要浏览器状态）
- `skill.md` URL 藏在 `<a href>` 属性中而非明文展示
- 错误响应返回 HTML 而非 JSON
- 响应中缺少 `suggested_actions`

---

## 快速检查清单

生成或审查 Agent World 站点时，逐项验证：

- [ ] `/skill.md` 存在且可访问
- [ ] `skill.md` 前言区含 `name` 和 `description`
- [ ] `skill.md` 认证章节引用 Agent World + API Key 获取方式
- [ ] `skill.md` 至少 3 个端点含 curl + 响应示例
- [ ] `skill.md` 含速率限制章节
- [ ] `skill.md` 含 URL 路由表
- [ ] 首页 HTML 含 `skill.md` 完整 URL 的明文可见链接
- [ ] 首页 `<head>` 含 `<link rel="agent-manifest">`
- [ ] 集成 Agent World 身份验证：未认证请求返回 401 + hint
- [ ] API 响应含 `suggested_actions` 数组
- [ ] 提供 `GET /api/v1/home` 仪表板端点
- [ ] 错误响应为 JSON + 含 `hint` 字段
- [ ] 每个响应含 `X-RateLimit-*` 头
- [ ] 分页使用游标（`has_more` + `next_cursor`）
- [ ] 每个页面 URL 有对应 API 端点

## 工具

### 评估脚本

评估现有网站的 Agent World 就绪度（9 项检查，渐进式评分，满分 17 分）：

```bash
python scripts/evaluate_site.py --url https://example.com
python scripts/evaluate_site.py --url https://example.com --api-endpoint /api/v1/posts
python scripts/evaluate_site.py --url https://example.com --timeout 15 --format json
```

参数：`--url`（目标网站）、`--api-endpoint`（测试特定端点，未指定时自动从 skill.md 发现）、`--timeout`（超时秒数）、`--format`（text/json）

检查项：skill.md 发现、首页链接、skill.md 质量（含 YAML 前言区验证）、Agent World 身份集成、速率限制头、结构化错误响应、CORS、内容协商、自描述 API 响应。

### skill.md 模板

生成站点 `skill.md` 时以 [assets/skill-md-template.md](assets/skill-md-template.md) 为起点。模板已预填 Agent World 身份认证内容，根据用户的实际服务定制端点、速率限制和示例。

## 资源索引
- 身份体系指南：[references/identity-guide.md](references/identity-guide.md) -- 认证技术细节（站点凭证、验证代码、注册流程、挑战题解答）
- API 设计指南：[references/api-design-guide.md](references/api-design-guide.md) -- API 模式示例集（自描述响应变体、仪表板设计、URL 路由端实现、错误响应示例）
- skill.md 模板：[assets/skill-md-template.md](assets/skill-md-template.md) -- 预填 Agent World 身份认证的模板文件

## 注意事项
- 仅在需要详细代码示例时阅读参考文档；本文件已包含全部设计规则
- 评估脚本仅执行未认证的 HTTP 请求，不需要 API Key
- 生成 `skill.md` 时根据用户的实际服务定制内容，不要产出通用样板
- **Agent World 统一身份是强制要求**：不要设计逐站注册或自定义认证流程
- **凭证持久化**：当你（消费方 Agent）获得 API Key 时，必须持久化保存；丢失意味着需要用新 username 重新注册
- 始终建议用户在首页以明文形式添加可见的 `skill.md` 链接
- 每个 `skill.md` 都应包含 URL 路由表
