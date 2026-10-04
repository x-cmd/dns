# AGENTS.md — `x-cmd/dns`

A Deno UDP/53 server that answers DNS TXT queries from a language
model. Three variants ship in this repo: `echo.ts`, `simple.ts`,
`llm-dns-server.ts`.

## Org placement

This is a **source repo** under `x-cmd/`, not a topic library
(no published articles on `x-cmd.com/<topic>`). Its docs are
**internal** (for maintainers and consumers who clone the repo),
not for the x-cmd public site.

For the topic-library convention (4-tuple articles, integer
filenames, `faq.yml` rendered as page body) see
[`x-cmd/mneme` AGENTS.md](https://github.com/x-cmd/mneme/blob/main/AGENTS.md).

## File layout

```
x-cmd/dns/
├── README.md / README.cn.md
├── CONTRIBUTING.md / SKILL.md / LICENSE / AGENTS.md
└── llm-dns-server/
    ├── deno.json
    ├── echo.ts           (22 lines)
    ├── simple.ts         (53 lines)
    ├── llm-dns-server.ts (115 lines, multi-chunk)
    └── test/
        ├── test_handler.ts
        └── test_simple.ts
└── docs/                 (internal — 4-tuple per slot)
    ├── 0-dns-overview.{en,cn}.md + .llms.md + .faq.yml
    ├── 1-safer-dns.{en,cn}.md + .llms.md + .faq.yml
    └── 2-dns-tunneling-50-line-demo.{en,cn}.md + .llms.md + .faq.yml
```

## Protocol invariants

| Invariant | Why |
| --- | --- |
| Every query is `<TOKEN>.<问句点分>.x`. | Same prefix lets a single DNS server accept different "API keys"; the trailing `.x` is any TLD the server drops. |
| `DNS_AUTH_TOKEN` defaults to `secret123`. | Match the README quick-start without env setup. |
| TXT character-string ≤255 bytes. | RFC 1035; dns-packet ≤5.6.1 mis-encodes at 256+, so either truncate the answer or split into ≤255-byte Buffer chunks. |
| LLM cache key = joined middle labels. | What the LLM sees; alignment matters for cache hit-rate. |
| `node_modules`, `deno.json`, `deno.lock` are gitignored at the `llm-dns-server/` level. | Deno's local-only setup; `deno install` re-creates them. |

## Boundary rules

- **Do not** edit `node_modules/`, `deno.json`, `deno.lock`
  manually — `deno install` regenerates them.
- **Do not** change the protocol grammar (query name format,
  chunk protocol) without a `CONTRIBUTING.md` discussion first.
  The DNS byte layout is load-bearing.
- **Do not** commit an `OPENAI_API_KEY` to `.gitignore`-exempt
  paths (logs, fixtures, etc.). The CI never sets it; secrets
  stay local.
- **Do not** add a topic-library article (no `0-llm-over-dns` →
  `x-cmd.com/dns` redirect). This is a source repo, not a
  content repo.

## Public-repo content-only rule

Applies (per `x-cmd/mneme/AGENTS.md`):

- ✅ Fixing typos, broken links, factual errors in docs.
- ✅ Adding a new variant under `llm-dns-server/` (file + test).
- ❌ Discussion of intent, strategic direction, or
  commercialization in commits/issues.