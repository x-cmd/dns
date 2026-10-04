# x-cmd/dns — LLM-over-DNS

DNS servers that answer TXT queries from a language model. Built with
Deno; serves on UDP/53 (or any port via `DNS_PORT`).

> 🌐 **中文版：[README.cn.md](./README.cn.md)**

## Three variants in this repo

| File | Lines | What it does |
| --- | --- | --- |
| [`llm-dns-server/echo.ts`](./llm-dns-server/echo.ts) | 22 | Pure passthrough. Strips the trailing TLD label and echoes the remainder as TXT. No LLM, no cache. |
| [`llm-dns-server/simple.ts`](./llm-dns-server/simple.ts) | 53 | Single-shot. Asks the LLM once and returns the answer (truncated to fit one DNS character-string) in the first response. Caches by question. |
| [`llm-dns-server/llm-dns-server.ts`](./llm-dns-server/llm-dns-server.ts) | 115 | Multi-chunk. Splits long answers into base64 chunks; the first response returns `N <sid>`, then `c.0.<sid>` … `c.N-1.<sid>` fetch each chunk. Caches by question. |

> All three share the same protocol surface: `dig @IP TXT
> "<TOKEN>.<问句点分>.x"` → TXT answer. Pick the variant that matches
> the answer-length profile you need.

## Quick start

```sh
cd llm-dns-server
deno install                              # one-time: resolve npm/dns-packet

# 1. echo server — no LLM required
DNS_PORT=5353 deno run -A echo.ts

# 2. simple LLM responder — needs an OpenAI-compatible API
DNS_PORT=5353 \
OPENAI_API_KEY=sk-... \
OPENAI_BASE_URL=https://api.minimaxi.com/v1 \
OPENAI_MODEL=MiniMax-M3 \
DNS_AUTH_TOKEN=secret123 \
deno run -A simple.ts

# 3. multi-chunk LLM responder — same env, full chunk protocol
deno run -A llm-dns-server.ts
```

Then query:

```sh
dig @127.0.0.1 -p 5353 "secret123.capital.of.france.x" TXT +short
# "The capital of France is **Paris**."
```

## Configuration

| Env | Default | Meaning |
| --- | --- | --- |
| `OPENAI_API_KEY` | _(empty)_ | Required by `simple.ts` and `llm-dns-server.ts`. |
| `OPENAI_BASE_URL` | `https://api.minimaxi.com/v1` | OpenAI-compatible chat-completions endpoint. |
| `OPENAI_MODEL` | `MiniMax-M3` | Model name passed to that endpoint. |
| `DNS_AUTH_TOKEN` | `secret123` | Token prefix every query must carry. |
| `DNS_PORT` | `53` | UDP port. Use a non-privileged port (`5353`, `15353`) for local testing. |

## Read next

- [docs/0-dns-overview.en.md](./docs/0-dns-overview.en.md) — DNS protocol
  basics: query lifecycle, record types, packet layout, TTL caching.
- [docs/1-safer-dns.en.md](./docs/1-safer-dns.en.md) — DoH / DoT / DoQ /
  DNSSEC: the four fixes that make DNS safe.
- [docs/2-dns-tunneling-50-line-demo.en.md](./docs/2-dns-tunneling-50-line-demo.en.md) —
  what DNS tunneling means and a 50-line walkthrough of the same
  skeleton this repo ships.
- For maintainers: [`CONTRIBUTING.md`](./CONTRIBUTING.md).
- For AI agents: [`SKILL.md`](./SKILL.md).

## Maintainers

This repo is maintained by the x-cmd team. Doc fixes and
feedback are welcome as issues; PRs touching the running
servers go through review because the DNS packet byte layout
matters more than usual here.