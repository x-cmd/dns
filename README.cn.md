# x-cmd/dns —— LLM-over-DNS

把语言模型作为 TXT 记录响应 DNS 查询的 DNS 服务端。Deno
编写，监听 UDP/53（也可用 `DNS_PORT` 换成任意端口）。

> 🌐 **English: [README.md](./README.md)**

## 本仓库三个变体

| 文件 | 行数 | 作用 |
| --- | --- | --- |
| [`llm-dns-server/echo.ts`](./llm-dns-server/echo.ts) | 22 | 纯回显。剥掉最后一个 TLD 标签后，把其余标签当 TXT 返回。无 LLM，无缓存。 |
| [`llm-dns-server/simple.ts`](./llm-dns-server/simple.ts) | 53 | 单次响应。调一次 LLM，把回答截到能塞进一条 DNS 字符字符串的大小后立即返回。按问题缓存。 |
| [`llm-dns-server/llm-dns-server.ts`](./llm-dns-server/llm-dns-server.ts) | 115 | 多块响应。长回答拆成 base64 块，首次响应返回 `N <sid>`，再依次拉 `c.0.<sid>` … `c.N-1.<sid>`。按问题缓存。 |

> 三个变体共享同一协议：`dig @IP TXT "<TOKEN>.<问句点分>.x"`
> → TXT 回答。按答案长度需求挑。

## 快速上手

```sh
cd llm-dns-server
deno install                              # 一次性：解析 npm/dns-packet

# 1. echo 服务 —— 不依赖 LLM
DNS_PORT=5353 deno run -A echo.ts

# 2. 简易 LLM 应答 —— 需 OpenAI 兼容 API
DNS_PORT=5353 \
OPENAI_API_KEY=sk-... \
OPENAI_BASE_URL=https://api.minimaxi.com/v1 \
OPENAI_MODEL=MiniMax-M3 \
DNS_AUTH_TOKEN=secret123 \
deno run -A simple.ts

# 3. 多块 LLM 应答 —— 同上环境，完整块协议
deno run -A llm-dns-server.ts
```

查询：

```sh
dig @127.0.0.1 -p 5353 "secret123.capital.of.france.x" TXT +short
# "The capital of France is **Paris**."
```

## 配置

| 环境变量 | 默认 | 含义 |
| --- | --- | --- |
| `OPENAI_API_KEY` | _(空)_ | `simple.ts` 与 `llm-dns-server.ts` 必填。 |
| `OPENAI_BASE_URL` | `https://api.minimaxi.com/v1` | OpenAI 兼容 chat-completions 端点。 |
| `OPENAI_MODEL` | `MiniMax-M3` | 调用该端点时使用的模型名。 |
| `DNS_AUTH_TOKEN` | `secret123` | 每个查询必须带的前缀。 |
| `DNS_PORT` | `53` | UDP 端口。本地请用非特权端口（`5353`、`15353`）。 |

## 延伸阅读

- [docs/0-dns-overview.cn.md](./docs/0-dns-overview.cn.md) —— DNS 协议
  基础：查询生命周期、记录类型、包结构、TTL 缓存。
- [docs/1-safer-dns.cn.md](./docs/1-safer-dns.cn.md) —— DoH / DoT / DoQ /
  DNSSEC：让 DNS 变安全的四种修复。
- [docs/2-dns-tunneling-50-line-demo.cn.md](./docs/2-dns-tunneling-50-line-demo.cn.md) ——
  DNS 隧道是什么意思，以及本仓库同骨架的 50 行走查。
- 维护者：[`CONTRIBUTING.md`](./CONTRIBUTING.md)。
- AI 代理：[`SKILL.md`](./SKILL.md)。

## 维护

本仓库由 x-cmd 团队维护。文档修正、反馈请走 issue；触及
运行服务的 PR 走评审，因为这里 DNS 报文字节布局影响比通常
更大。