---
name: dns
description: DNS servers that answer TXT queries from a language model. Use when the user asks for "LLM over DNS", "DNS query to LLM", "chat with an AI via dig", "ask a question through DNS", or wants to run a Deno UDP server that returns an LLM-completed answer as a TXT record.
metadata: type=source, runtime=deno-2.x, protocol=dns-udp-53, transport=txt-records, schema=query-name, refresh=server-stateful, license=apache-2.0, scope=dns-server-source
---

# x-cmd/dns — running an LLM-over-DNS server

## Two consumption paths

### 1. Run a server (developer)

```sh
cd llm-dns-server
deno install                                          # one-time
DNS_PORT=15353 \
OPENAI_API_KEY=sk-... \
OPENAI_BASE_URL=https://api.minimaxi.com/v1 \
OPENAI_MODEL=MiniMax-M3 \
DNS_AUTH_TOKEN=secret123 \
deno run -A simple.ts                                 # single-shot
# or:
deno run -A llm-dns-server.ts                         # multi-chunk
# or:
deno run -A echo.ts                                   # no LLM
```

`DNS_PORT=53` requires `sudo` on macOS / Linux; pick a
non-privileged port (15353, 5353, 8053) for local testing.

### 2. Query an existing server (user)

```sh
dig @127.0.0.1 -p 15353 \
    "secret123.<question-as-dotted-labels>.x" TXT +short

# examples
dig @127.0.0.1 -p 15353 "secret123.capital.of.france.x" TXT +short
dig @127.0.0.1 -p 15353 "secret123.what.is.2+2.x"      TXT +short
```

Replace `secret123` with whatever `DNS_AUTH_TOKEN` the server
was started with. The trailing `<x>` is any TLD; the server
drops it.

For the multi-chunk variant the first response is `"<N> <sid>"`,
then fetch `c.0.<sid>` … `c.N-1.<sid>`, base64-decode each
chunk, and concatenate.

## Schema — what's in this repo

| Path | Purpose |
| --- | --- |
| `llm-dns-server/llm-dns-server.ts` | Multi-chunk LLM responder. `115` lines. |
| `llm-dns-server/simple.ts` | Single-shot LLM responder with question cache. `53` lines. |
| `llm-dns-server/echo.ts` | Pure passthrough. `22` lines. |
| `llm-dns-server/deno.json` | Maps `dns-packet` to `npm:dns-packet@5.6.1`. |
| `llm-dns-server/test/test_handler.ts` | Unit tests for the multi-chunk variant. |
| `llm-dns-server/test/test_simple.ts` | Unit tests for the single-shot variant. |
| `docs/0-dns-overview.{en,cn}.md` | DNS protocol reference. |
| `docs/1-safer-dns.{en,cn}.md` | DoH / DoT / DoQ / DNSSEC. |
| `docs/2-dns-tunneling-50-line-demo.{en,cn}.md` | DNS tunneling: principle + 50-line demo. |
| `docs/*.faq.yml` | Bilingual FAQ; rendered as part of the article body. |
| `docs/*.llms.md` | LLM-friendly overview. |

## Common queries

**"Can I run this without an LLM API key?"** — Yes; use
`echo.ts`. It strips the trailing label and echoes the rest.
Useful as a connectivity probe or as a reference for the DNS
packet encoding.

**"How long can the answer be?"** —
- `echo.ts`: up to one DNS character-string (255 bytes).
- `simple.ts`: same (the answer is truncated to 255 UTF-8
  bytes).
- `llm-dns-server.ts`: unbounded in principle; the answer is
  base64-encoded into 186-byte source chunks (≈248 base64 chars
  per chunk), and each chunk fetches as one TXT character-string.

**"Why port 53 needs sudo"** — Standard DNS listens on UDP/53,
a privileged port (<1024). Run on a non-privileged port locally.

**"Why does `dig` say 'malformed message'?"** — Likely the
DNS-packet 256-byte bug. The fix is either: truncate the answer
to 255 bytes (the `simple` and `echo` variants), or split the
TXT payload into ≤255-byte Buffer chunks before `dp.encode()`
(the multi-chunk variant does this in `buildTxtResponse`).

**"Where does the cache live?"** — In-memory `Map` per process.
The cache key is the joined middle labels (the question string
the LLM would see). No TTL, no eviction policy beyond a hard
`ANSWER_CACHE_MAX_SIZE = 256` (oldest-inserted key dropped on
overflow in the multi-chunk variant; unbounded in `simple.ts`).

## Decision — which variant to pick

| Need | Use |
| --- | --- |
| Just want to see DNS work end-to-end, no LLM | `echo.ts` |
| Short factual answers, want low latency on repeat questions | `simple.ts` |
| Long, structured answers (Markdown, code, lists) | `llm-dns-server.ts` |