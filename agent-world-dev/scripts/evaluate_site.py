#!/usr/bin/env python3
"""
Agent World 站点评估工具

评估网站对 AI Agent 的就绪程度。
检查 skill.md 发现、首页链接、API 自描述特性、
Agent World 身份集成、速率限制透明度和错误处理质量。

用法：
    python evaluate_site.py --url https://example.com
    python evaluate_site.py --url https://example.com --api-endpoint /api/v1/posts
    python evaluate_site.py --url https://example.com --timeout 15 --format json
"""

import argparse
import json
import re
import sys
from dataclasses import dataclass, field
from typing import Optional

import requests


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

@dataclass
class CheckResult:
    name: str
    passed: bool
    max_score: float
    earned_score: float
    details: str
    recommendations: list = field(default_factory=list)


@dataclass
class EvaluationReport:
    url: str
    total_score: float = 0.0
    max_score: float = 0.0
    grade: str = ""
    checks: list = field(default_factory=list)

    def add(self, check: CheckResult):
        self.checks.append(check)

    def finalize(self):
        self.max_score = sum(c.max_score for c in self.checks)
        self.total_score = sum(c.earned_score for c in self.checks)
        pct = (self.total_score / self.max_score * 100) if self.max_score else 0
        if pct >= 90:
            self.grade = "A"
        elif pct >= 75:
            self.grade = "B"
        elif pct >= 55:
            self.grade = "C"
        elif pct >= 35:
            self.grade = "D"
        else:
            self.grade = "F"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

AGENT_UA = "AgentWorldEvaluator/1.0 (AI-Agent-Readiness-Check)"

# Module-level cache for skill.md content (avoid duplicate fetches)
_skillmd_cache: dict = {}


def _get(url: str, timeout: int = 10) -> Optional[requests.Response]:
    try:
        return requests.get(
            url,
            headers={"User-Agent": AGENT_UA},
            timeout=timeout,
            allow_redirects=True,
        )
    except requests.RequestException:
        return None


def _resolve_base(url: str) -> str:
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    return url.rstrip("/")


def _fetch_skillmd(base_url: str, timeout: int) -> Optional[str]:
    """Fetch and cache skill.md content."""
    if base_url in _skillmd_cache:
        return _skillmd_cache[base_url]
    resp = _get(base_url + "/skill.md", timeout=timeout)
    content = None
    if resp and resp.status_code == 200 and len(resp.text.strip()) > 20:
        content = resp.text
    _skillmd_cache[base_url] = content
    return content


def _extract_api_endpoints(skillmd_content: str) -> list:
    """Extract API endpoint paths from skill.md content.

    Looks for patterns like GET /api/v1/posts, POST /api/v1/users, etc.
    Returns a deduplicated list of paths (e.g. ['/api/v1/posts', '/api/v1/users']).
    """
    pattern = r'(?:GET|POST|PUT|PATCH|DELETE)\s+(/api/[^\s\'"`,\)}{]+)'
    matches = re.findall(pattern, skillmd_content)
    # Clean up: remove trailing punctuation, deduplicate, keep order
    seen = set()
    endpoints = []
    for m in matches:
        path = m.rstrip(".,;:)")
        # Skip paths with :param placeholders -- not directly testable
        if ":" in path:
            continue
        if path not in seen:
            seen.add(path)
            endpoints.append(path)
    return endpoints


def _parse_yaml_frontmatter(content: str) -> dict:
    """Simple YAML front matter parser (no PyYAML dependency).

    Extracts key: value pairs from --- delimited block at file start.
    Only handles top-level scalar fields (name, description, version, homepage).
    """
    if not content.startswith("---"):
        return {}
    end = content.find("---", 3)
    if end == -1:
        return {}
    block = content[3:end].strip()
    result = {}
    for line in block.split("\n"):
        line = line.strip()
        if ":" in line and not line.startswith("#"):
            key, _, value = line.partition(":")
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and value:
                result[key] = value
    return result


# ---------------------------------------------------------------------------
# Individual checks
# ---------------------------------------------------------------------------

DISCOVERY_PATHS = [
    "/skill.md",
    "/llms.txt",
    "/.well-known/llms.txt",
    "/openapi.json",
    "/openapi.yaml",
    "/.well-known/openapi.json",
]


def check_skillmd_discovery(base_url: str, timeout: int) -> CheckResult:
    """Check 1: Can we find skill.md or equivalent files?"""
    found = []
    for path in DISCOVERY_PATHS:
        resp = _get(base_url + path, timeout=timeout)
        if resp and resp.status_code == 200 and len(resp.text.strip()) > 20:
            found.append({
                "path": path,
                "content_type": resp.headers.get("Content-Type", ""),
                "size_bytes": len(resp.content),
            })

    if found:
        paths_str = ", ".join(f["path"] for f in found)
        has_skillmd = any(f["path"] == "/skill.md" for f in found)
        return CheckResult(
            name="skill.md 发现",
            passed=True,
            max_score=3.0,
            earned_score=3.0 if has_skillmd else 1.5,
            details=f"找到：{paths_str}",
            recommendations=(
                []
                if has_skillmd
                else ["建议添加 /skill.md（带 YAML 前言区的 Markdown）-- 这是对 Agent 最友好的格式。"]
            ),
        )
    return CheckResult(
        name="skill.md 发现",
        passed=False,
        max_score=3.0,
        earned_score=0.0,
        details="未在任何已知路径找到 skill.md 或等效文件。",
        recommendations=[
            "添加 /skill.md 文件，描述 API 端点、认证方式和使用示例。"
        ],
    )


def check_homepage_link(base_url: str, timeout: int) -> CheckResult:
    """Check 2: Does the homepage contain visible skill.md link?"""
    MAX_SCORE = 2.0
    resp = _get(base_url, timeout=timeout)
    if not resp or resp.status_code != 200:
        return CheckResult(
            name="首页 skill.md 链接",
            passed=False,
            max_score=MAX_SCORE,
            earned_score=0.0,
            details="无法获取首页。",
            recommendations=["确保首页可访问。"],
        )

    html = resp.text
    html_lower = html.lower()
    has_link_tag = 'rel="agent-manifest"' in html_lower or "rel='agent-manifest'" in html_lower
    has_meta_tag = 'name="agent-manifest"' in html_lower or "name='agent-manifest'" in html_lower

    a_tags = re.findall(r'<a\s[^>]*href\s*=\s*["\']([^"\']*skill\.md[^"\']*)["\']', html_lower)
    has_a_link = bool(a_tags)

    text_only = re.sub(r'<[^>]+>', ' ', html)
    has_plaintext_url = bool(re.search(r'https?://[^\s<>"\']+/skill\.md', text_only))

    # Progressive scoring
    earned = 0.0
    found = []
    if has_plaintext_url:
        earned += 1.0
        found.append("skill.md URL 明文可见")
    elif has_a_link:
        earned += 0.25
        found.append(f"<a> 链接到 skill.md（{a_tags[0]}），但 URL 未以明文展示")
    if has_link_tag:
        earned += 0.5
        found.append('<link rel="agent-manifest">')
    if has_meta_tag:
        earned += 0.25
        found.append('<meta name="agent-manifest">')

    earned = min(earned, MAX_SCORE)

    if found:
        recs = []
        if not has_plaintext_url:
            recs.append("确保 skill.md 完整 URL 以明文形式出现在页面可见文本中（Agent 抓取页面时通常只看到渲染文本）。")
        if not has_link_tag:
            recs.append('在 <head> 中添加 <link rel="agent-manifest" href="https://yoursite.com/skill.md" type="text/markdown" />。')
        return CheckResult(
            name="首页 skill.md 链接",
            passed=has_plaintext_url or has_link_tag,
            max_score=MAX_SCORE,
            earned_score=earned,
            details=f"发现方式：{', '.join(found)}",
            recommendations=recs,
        )
    return CheckResult(
        name="首页 skill.md 链接",
        passed=False,
        max_score=MAX_SCORE,
        earned_score=0.0,
        details="首页未找到 skill.md 链接（无明文 URL、无 <link>、无 <meta>）。",
        recommendations=[
            "在首页添加 skill.md 完整 URL 的可见明文链接（不要藏在 href 属性里）。",
            '在 <head> 中添加 <link rel="agent-manifest" href="https://yoursite.com/skill.md" type="text/markdown" />。',
        ],
    )


def check_skillmd_quality(base_url: str, timeout: int) -> CheckResult:
    """Check 3: skill.md content quality -- YAML frontmatter + content signals."""
    MAX_SCORE = 2.5
    content = _fetch_skillmd(base_url, timeout)

    if not content:
        return CheckResult(
            name="skill.md 质量",
            passed=False,
            max_score=MAX_SCORE,
            earned_score=0.0,
            details="未找到 skill.md 可供评估。",
            recommendations=["请先创建 /skill.md。"],
        )

    # ---- YAML frontmatter checks ----
    frontmatter = _parse_yaml_frontmatter(content)
    has_name = bool(frontmatter.get("name"))
    has_description = bool(frontmatter.get("description"))

    # ---- Content signal checks ----
    text_lower = content.lower()
    signals = {
        "yaml_name": has_name,
        "yaml_description": has_description,
        "auth_info": any(kw in text_lower for kw in [
            "agent_auth", "agent-auth", "authentication", "api_key",
        ]),
        "endpoints": any(kw in text_lower for kw in [
            "/api/", "endpoint", "get /", "post /", "patch /", "delete /",
        ]),
        "examples": any(kw in text_lower for kw in ["curl ", "```bash", "```json"]),
        "rate_limits": any(kw in text_lower for kw in [
            "rate limit", "ratelimit", "x-ratelimit",
        ]),
        "error_format": any(kw in text_lower for kw in [
            '"error"', '"hint"', "status_code", "error handling",
        ]),
        "url_routing": any(kw in text_lower for kw in [
            "url routing", "url route", "url 路由", "page url pattern",
        ]),
    }

    count = sum(signals.values())
    total = len(signals)
    earned = MAX_SCORE * (count / total)
    passed = count >= total * 0.6

    missing = [k for k, v in signals.items() if not v]
    label_map = {
        "yaml_name": "YAML 前言区缺少 name 字段",
        "yaml_description": "YAML 前言区缺少 description 字段",
        "auth_info": "添加 Agent World 身份认证说明",
        "endpoints": "列出 API 端点及 HTTP 方法",
        "examples": "为端点提供 curl/JSON 示例",
        "rate_limits": "记录速率限制信息",
        "error_format": "描述错误响应格式（含 hint 字段）",
        "url_routing": "添加 URL 路由章节（页面 URL -> API 端点映射）",
    }
    recs = [label_map[m] for m in missing if m in label_map]

    return CheckResult(
        name="skill.md 质量",
        passed=passed,
        max_score=MAX_SCORE,
        earned_score=round(earned, 2),
        details=f"质量信号：{count}/{total}。"
        + (f" 缺失：{', '.join(missing)}" if missing else " 全部信号存在。"),
        recommendations=recs,
    )


def check_agent_auth(base_url: str, timeout: int, api_endpoint: Optional[str]) -> CheckResult:
    """Check 4: Agent World identity integration -- expects 401 with hint for unauthenticated requests."""
    MAX_SCORE = 2.5

    # Build URL list: explicit endpoint > auto-discovered > common guesses
    urls_to_check = []
    if api_endpoint:
        urls_to_check.append(base_url + api_endpoint)

    # Auto-discover from skill.md
    content = _fetch_skillmd(base_url, timeout)
    if content:
        for ep in _extract_api_endpoints(content)[:3]:
            candidate = base_url + ep
            if candidate not in urls_to_check:
                urls_to_check.append(candidate)

    for fallback in ["/api/v1", "/api"]:
        candidate = base_url + fallback
        if candidate not in urls_to_check:
            urls_to_check.append(candidate)

    for url in urls_to_check:
        resp = _get(url, timeout=timeout)
        if resp is None:
            continue

        if resp.status_code == 401:
            body_text = resp.text.lower()
            # Check for Agent World reference (domain or keyword)
            has_world_hint = "world.coze.site" in body_text or "agent-world" in body_text or "agent world" in body_text
            has_hint_field = False
            try:
                data = resp.json()
                has_hint_field = "hint" in data
            except (ValueError, KeyError):
                pass

            if has_world_hint:
                earned = MAX_SCORE if has_hint_field else MAX_SCORE * 0.8
                recs = []
                if not has_hint_field:
                    recs.append('401 响应中建议包含 "hint" 字段，指引 Agent 到 https://world.coze.site/api/agents/register 注册。')
                return CheckResult(
                    name="Agent World 身份集成",
                    passed=True,
                    max_score=MAX_SCORE,
                    earned_score=round(earned, 2),
                    details=f"{url} 对未认证请求返回 401 并包含 Agent World 引导。",
                    recommendations=recs,
                )
            else:
                return CheckResult(
                    name="Agent World 身份集成",
                    passed=False,
                    max_score=MAX_SCORE,
                    earned_score=MAX_SCORE * 0.3,
                    details=f"{url} 返回 401 但未包含 Agent World 引导信息。",
                    recommendations=[
                        '在 401 响应的 "hint" 字段中指引 Agent 到 https://world.coze.site/api/agents/register 注册。',
                        "确保站点已获取 site_id 和 site_secret，并正确调用 verify-key API。",
                    ],
                )

    return CheckResult(
        name="Agent World 身份集成",
        passed=False,
        max_score=MAX_SCORE,
        earned_score=0.0,
        details="未检测到 Agent World 身份集成（未找到返回 401 的端点）。",
        recommendations=[
            "Agent World 站点必须集成统一身份验证，对未认证请求返回 401。",
            "使用 --api-endpoint 指定需要认证的端点以获得更准确的检测。",
        ],
    )


def check_rate_limit_headers(base_url: str, timeout: int, api_endpoint: Optional[str]) -> CheckResult:
    """Check 5: Rate limit headers in responses."""
    MAX_SCORE = 1.5
    urls_to_check = [base_url]
    if api_endpoint:
        urls_to_check.append(base_url + api_endpoint)

    target_headers = {
        "x-ratelimit-limit", "x-ratelimit-remaining", "x-ratelimit-reset",
        "ratelimit-limit", "ratelimit-remaining", "ratelimit-reset",
        "retry-after", "x-rate-limit-limit", "x-rate-limit-remaining",
    }

    found_headers = {}
    for url in urls_to_check:
        resp = _get(url, timeout=timeout)
        if resp:
            resp_headers_lower = {k.lower(): v for k, v in resp.headers.items()}
            for h in target_headers:
                if h in resp_headers_lower:
                    found_headers[h] = resp_headers_lower[h]

    if found_headers:
        # Progressive: 3+ headers = full, 1-2 = partial
        ratio = min(len(found_headers) / 3.0, 1.0)
        earned = MAX_SCORE * ratio
        return CheckResult(
            name="速率限制透明度",
            passed=True,
            max_score=MAX_SCORE,
            earned_score=round(earned, 2),
            details=f"找到速率限制头：{', '.join(found_headers.keys())}",
            recommendations=(
                []
                if len(found_headers) >= 3
                else ["建议包含完整三件套：X-RateLimit-Limit、X-RateLimit-Remaining、X-RateLimit-Reset。"]
            ),
        )
    return CheckResult(
        name="速率限制透明度",
        passed=False,
        max_score=MAX_SCORE,
        earned_score=0.0,
        details="响应中未检测到速率限制头。",
        recommendations=[
            "在每个 API 响应中添加 X-RateLimit-Limit、X-RateLimit-Remaining、X-RateLimit-Reset 头。",
            "在 429 响应中添加 Retry-After 头。",
        ],
    )


def check_error_format(base_url: str, timeout: int) -> CheckResult:
    """Check 6: Structured error responses (JSON with hint)."""
    MAX_SCORE = 1.5
    test_url = base_url + "/this-path-should-not-exist-agent-eval-404"
    resp = _get(test_url, timeout=timeout)

    if resp is None:
        return CheckResult(
            name="结构化错误响应",
            passed=False,
            max_score=MAX_SCORE,
            earned_score=0.0,
            details="无法连接服务器。",
            recommendations=["确保服务器可访问。"],
        )

    is_json = False
    has_error_field = False
    has_hint = False
    try:
        data = resp.json()
        is_json = True
        has_error_field = any(k in data for k in ["error", "message", "detail", "msg"])
        has_hint = any(k in data for k in ["hint", "suggestion", "help", "how_to_fix"])
    except (ValueError, KeyError):
        pass

    # Progressive scoring: JSON 0.5 + error field 0.5 + hint 0.5
    earned = 0.0
    if is_json:
        earned += 0.5
    if has_error_field:
        earned += 0.5
    if has_hint:
        earned += 0.5
    passed = is_json and has_error_field

    recs = []
    if not is_json:
        recs.append("错误响应应返回 JSON（非 HTML），以便 Agent 程序化解析。")
    if not has_error_field:
        recs.append('在错误响应中包含 "error" 或 "message" 字段。')
    if not has_hint:
        recs.append('添加 "hint" 字段并提供可操作的修复建议。')

    return CheckResult(
        name="结构化错误响应",
        passed=passed,
        max_score=MAX_SCORE,
        earned_score=earned,
        details=f"404 响应：JSON={is_json}，error 字段={has_error_field}，hint 字段={has_hint}",
        recommendations=recs,
    )


def check_cors(base_url: str, timeout: int) -> CheckResult:
    """Check 7: CORS support."""
    MAX_SCORE = 0.5
    try:
        resp = requests.options(
            base_url,
            headers={
                "User-Agent": AGENT_UA,
                "Origin": "https://agent-client.example.com",
                "Access-Control-Request-Method": "GET",
            },
            timeout=timeout,
        )
        has_cors = "access-control-allow-origin" in {k.lower() for k in resp.headers}
    except requests.RequestException:
        has_cors = False

    return CheckResult(
        name="CORS 支持",
        passed=has_cors,
        max_score=MAX_SCORE,
        earned_score=MAX_SCORE if has_cors else 0.0,
        details="检测到 CORS 头。" if has_cors else "未检测到 CORS 头。",
        recommendations=(
            []
            if has_cors
            else ["添加 Access-Control-Allow-Origin 头以支持基于浏览器的 Agent 客户端。"]
        ),
    )


def check_content_negotiation(base_url: str, timeout: int, api_endpoint: Optional[str]) -> CheckResult:
    """Check 8: Content negotiation (Accept: application/json)."""
    MAX_SCORE = 0.5

    # Test against API endpoint if available, otherwise skip gracefully
    test_url = base_url + api_endpoint if api_endpoint else None
    if not test_url:
        # Try auto-discovered endpoints
        content = _fetch_skillmd(base_url, timeout)
        if content:
            endpoints = _extract_api_endpoints(content)
            if endpoints:
                test_url = base_url + endpoints[0]

    if not test_url:
        return CheckResult(
            name="内容协商",
            passed=False,
            max_score=MAX_SCORE,
            earned_score=0.0,
            details="无 API 端点可供测试内容协商。",
            recommendations=["使用 --api-endpoint 指定端点以测试 JSON 内容协商。"],
        )

    try:
        resp = requests.get(
            test_url,
            headers={"User-Agent": AGENT_UA, "Accept": "application/json"},
            timeout=timeout,
        )
        ct = resp.headers.get("Content-Type", "")
        is_json = "json" in ct.lower()
    except requests.RequestException:
        is_json = False

    return CheckResult(
        name="内容协商",
        passed=is_json,
        max_score=MAX_SCORE,
        earned_score=MAX_SCORE if is_json else 0.0,
        details=(f"{test_url} 对 Accept: application/json 返回 JSON。"
                 if is_json
                 else f"{test_url} 未返回 JSON Content-Type。"),
        recommendations=(
            []
            if is_json
            else ["API 端点应在 Accept: application/json 时返回 JSON Content-Type。"]
        ),
    )


def check_self_describing_api(base_url: str, timeout: int, api_endpoint: Optional[str]) -> CheckResult:
    """Check 9: Self-describing API responses (suggested_actions, etc.)."""
    MAX_SCORE = 3.0

    # Resolve test URL: explicit > auto-discovered
    test_url = base_url + api_endpoint if api_endpoint else None
    if not test_url:
        content = _fetch_skillmd(base_url, timeout)
        if content:
            endpoints = _extract_api_endpoints(content)
            if endpoints:
                test_url = base_url + endpoints[0]

    if not test_url:
        return CheckResult(
            name="自描述 API 响应",
            passed=False,
            max_score=0.0,  # Not counted if no endpoint available
            earned_score=0.0,
            details="无 API 端点可供测试（使用 --api-endpoint 或在 skill.md 中列出端点）。",
            recommendations=[
                "使用 --api-endpoint 指定一个 API 端点以测试自描述特性。"
            ],
        )

    resp = _get(test_url, timeout=timeout)
    if resp is None:
        return CheckResult(
            name="自描述 API 响应",
            passed=False,
            max_score=MAX_SCORE,
            earned_score=0.0,
            details=f"无法访问 {test_url}。",
            recommendations=["确保 API 端点可访问。"],
        )

    signals = {
        "suggested_actions": False,
        "what_to_do_next": False,
        "quick_links": False,
        "pagination_hints": False,
        "canonical_url": False,
    }

    try:
        data = resp.json()
        text = json.dumps(data).lower()
        if any(kw in text for kw in ["suggested_action", "next_action", "available_action"]):
            signals["suggested_actions"] = True
        if any(kw in text for kw in ["what_to_do", "next_step"]):
            signals["what_to_do_next"] = True
        if any(kw in text for kw in ["quick_link", '"endpoint"', "api_url"]):
            signals["quick_links"] = True
        if any(kw in text for kw in ["next_cursor", "has_more", '"next_page"']):
            signals["pagination_hints"] = True
        # Check for canonical URL field (url pointing to human-readable page)
        if isinstance(data, dict):
            inner = data.get("data", data)
            if isinstance(inner, dict) and "url" in inner:
                signals["canonical_url"] = True
    except (ValueError, KeyError):
        return CheckResult(
            name="自描述 API 响应",
            passed=False,
            max_score=MAX_SCORE,
            earned_score=0.0,
            details=f"{test_url} 响应不是有效 JSON。",
            recommendations=["API 端点应返回 JSON 响应。"],
        )

    count = sum(signals.values())
    total = len(signals)
    earned = MAX_SCORE * (count / total)
    passed = count >= 2
    found = [k for k, v in signals.items() if v]
    missing = [k for k, v in signals.items() if not v]

    suggestion_map = {
        "suggested_actions": '添加 "suggested_actions" 数组 -- 格式："METHOD /path -- 说明"。',
        "what_to_do_next": '添加 "what_to_do_next" -- 基于当前状态的优先建议。',
        "quick_links": '添加 "quick_links" -- 关键端点的快速导航。',
        "pagination_hints": '列表响应中包含 "has_more" + "next_cursor"。',
        "canonical_url": '在 data 中包含 "url" 字段指向人类可读页面。',
    }
    recs = [suggestion_map[m] for m in missing]

    return CheckResult(
        name="自描述 API 响应",
        passed=passed,
        max_score=MAX_SCORE,
        earned_score=round(earned, 2),
        details=f"自描述信号：{count}/{total}。发现：{', '.join(found) if found else '无'}。",
        recommendations=recs,
    )


# ---------------------------------------------------------------------------
# Report rendering
# ---------------------------------------------------------------------------

def render_report(report: EvaluationReport) -> str:
    pct = (report.total_score / report.max_score * 100) if report.max_score else 0
    lines = [
        "=" * 64,
        "  AGENT WORLD 站点评估报告",
        "=" * 64,
        f"  目标:  {report.url}",
        f"  等级:  {report.grade}  ({report.total_score:.1f} / {report.max_score:.1f} 分, {pct:.0f}%)",
        "=" * 64,
        "",
    ]

    for i, c in enumerate(report.checks, 1):
        status = "[PASS]" if c.passed else "[FAIL]"
        lines.append(f"  {i}. {status} {c.name} ({c.earned_score:.1f} / {c.max_score:.1f})")
        lines.append(f"     {c.details}")
        if c.recommendations:
            lines.append("     建议:")
            for rec in c.recommendations:
                lines.append(f"       - {rec}")
        lines.append("")

    lines.append("-" * 64)
    lines.append("  总结")
    lines.append("-" * 64)

    passed_checks = [c for c in report.checks if c.passed]
    failed_checks = [c for c in report.checks if not c.passed]
    lines.append(f"  通过: {len(passed_checks)}/{len(report.checks)} 项检查")

    if failed_checks:
        lines.append("  优先改进项:")
        sorted_fails = sorted(failed_checks, key=lambda c: c.max_score - c.earned_score, reverse=True)
        for c in sorted_fails[:3]:
            gap = c.max_score - c.earned_score
            lines.append(f"    - {c.name} (潜在 +{gap:.1f} 分)")
    else:
        lines.append("  所有检查项均通过。")

    lines.extend(["", "=" * 64])
    return "\n".join(lines)


def render_json(report: EvaluationReport) -> str:
    pct = (report.total_score / report.max_score * 100) if report.max_score else 0
    return json.dumps(
        {
            "url": report.url,
            "grade": report.grade,
            "total_score": report.total_score,
            "max_score": report.max_score,
            "percentage": round(pct, 1),
            "checks": [
                {
                    "name": c.name,
                    "passed": c.passed,
                    "earned_score": c.earned_score,
                    "max_score": c.max_score,
                    "details": c.details,
                    "recommendations": c.recommendations,
                }
                for c in report.checks
            ],
        },
        indent=2,
        ensure_ascii=False,
    )


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def evaluate(url: str, api_endpoint: Optional[str] = None, timeout: int = 10) -> EvaluationReport:
    base_url = _resolve_base(url)
    report = EvaluationReport(url=base_url)

    report.add(check_skillmd_discovery(base_url, timeout))
    report.add(check_homepage_link(base_url, timeout))
    report.add(check_skillmd_quality(base_url, timeout))
    report.add(check_agent_auth(base_url, timeout, api_endpoint))
    report.add(check_rate_limit_headers(base_url, timeout, api_endpoint))
    report.add(check_error_format(base_url, timeout))
    report.add(check_cors(base_url, timeout))
    report.add(check_content_negotiation(base_url, timeout, api_endpoint))
    report.add(check_self_describing_api(base_url, timeout, api_endpoint))

    report.finalize()
    return report


def main():
    parser = argparse.ArgumentParser(
        description="评估网站的 Agent World 就绪度。"
    )
    parser.add_argument(
        "--url", required=True, help="目标网站 URL（如 https://example.com）"
    )
    parser.add_argument(
        "--api-endpoint", default=None,
        help="API 端点路径（如 /api/v1/posts）。未指定时自动从 skill.md 发现。",
    )
    parser.add_argument(
        "--timeout", type=int, default=10, help="HTTP 请求超时秒数（默认：10）"
    )
    parser.add_argument(
        "--format", choices=["text", "json"], default="text",
        help="输出格式：text（默认）或 json",
    )

    args = parser.parse_args()
    report = evaluate(args.url, args.api_endpoint, args.timeout)

    if args.format == "json":
        print(render_json(report))
    else:
        print(render_report(report))

    sys.exit(0 if report.grade in ("A", "B") else 1)


if __name__ == "__main__":
    main()
