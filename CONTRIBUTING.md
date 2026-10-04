# Contributing

This page covers the maintainer side of the
[`x-cmd/dns`](https://github.com/x-cmd/dns) repo — file layout,
the DNS-packet encoding constraints, the protocol design choices
behind the three variants, and how to add a new article under
`docs/`.

## Repo layout

```
x-cmd/dns/
├── README.md                # English front-of-page
├── README.cn.md             # Chinese version
├── CONTRIBUTING.md          # this file
├── SKILL.md                 # AI-agent recipe
├── LICENSE                  # Apache-2.0
├── AGENTS.md                # cross-repo boundary rules
├── .gitignore
└── llm-dns-server/
    ├── deno.json            # "dns-packet" → npm:dns-packet@5.6.1
    ├── deno.lock            # (gitignored)
    ├── llm-dns-server.ts    # multi-chunk variant
    ├── simple.ts            # single-shot variant
    ├── echo.ts              # passthrough variant
    └── test/
        ├── test_handler.ts  # 6/6 unit tests for llm-dns-server.ts
        └── test_simple.ts   # 7/7 unit tests for simple.ts
└── docs/                    # articles, 4-tuple per slot
    ├── 0-dns-overview.{en,cn}.md + llms.md + faq.yml
    ├── 1-safer-dns.{en,cn}.md + llms.md + faq.yml
    └── 2-dns-tunneling-50-line-demo.{en,cn}.md + llms.md + faq.yml
```

## Protocol invariants — read before touching any of the three .ts files

1. **Query grammar.** Every query must be `secret123.<问句点分>.x`
   — a literal `secret123` (or `$DNS_AUTH_TOKEN`) prefix, the
   question split into DNS labels, and a trailing TLD (any single
   label). The server drops the prefix and the trailing label,
   joins the middle labels with spaces, and that's the question.

2. **TXT character-string limit.** RFC 1035 caps each TXT
   character-string at 255 bytes. The DNS-packet library
   (≤5.6.1) mis-encodes payloads whose single character-string
   would be ≥256 bytes: it splits at wrong boundaries and the
   RDLENGTH overruns the buffer, so `dig` reports "malformed
   message packet". Workaround: split into ≤255-byte Buffer
   chunks before `dp.encode()`, or truncate the payload to
   ≤255 bytes (`simple.ts` and `echo.ts` do the latter).

3. **Cache key.** In the LLM variants the cache key is the
   **joined middle labels** (e.g. `hello in french`), not the
   raw query name. This is what the LLM sees, so the cache
   hit/miss aligns with what the user asked.

4. **Chunk protocol.** `llm-dns-server.ts` returns
   `"<N> <sid>"` first; the client then issues
   `c.<i>.<sid>` for `i ∈ [0, N)` to fetch each base64-encoded
   chunk. The session map (`sid → chunks`) is the lookup
   table; the question cache is separate and keyed on the
   question string.

## Adding a new variant

If you add a fourth variant under `llm-dns-server/`:

1. Match the existing naming (`<thing>.ts`, kebab-case optional).
2. Read `DNS_AUTH_TOKEN` / `OPENAI_*` / `DNS_PORT` from env the
   same way.
3. Build TXT responses through a local `txt(...)` helper so the
   255-byte split rule stays in one place per file.
4. Add a unit test under `test/test_<thing>.ts` mirroring the
   structure of `test_handler.ts` / `test_simple.ts`.
5. Mention it in `docs/1-variants-and-pitfalls.{en,cn}.md` and
   bump the variant count in `README.md`.

## Adding an article under `docs/`

Topic repos in the x-cmd org use a 4-tuple convention — see
[`x-cmd/mneme` AGENTS.md](https://github.com/x-cmd/mneme/blob/main/AGENTS.md)
for the full spec. Per slot:

```
docs/
├── N-<slug>.en.md      # English article (frontmatter: x-title, x-desc, x-sidebar, x-keywords, x-json-ld)
├── N-<slug>.cn.md      # Chinese translation
├── N-<slug>.llms.md    # LLM-friendly summary (frontmatter: name, description, type: summary; flat sections)
└── N-<slug>.faq.yml    # bilingual Q&A (top-level id, data[] with id/question/answer/reference/confidence)
```

`N` is the reading order. If you change one file, change all four
in the same commit.

## Local development

```sh
cd llm-dns-server
deno install              # resolves dns-packet from deno.json
deno check *.ts test/*.ts
deno run -A test/test_handler.ts   # 6/6
deno run -A test/test_simple.ts    # 7/7
```

For an end-to-end probe:

```sh
DNS_PORT=15353 \
OPENAI_API_KEY=sk-... \
OPENAI_BASE_URL=https://api.minimaxi.com/v1 \
OPENAI_MODEL=MiniMax-M3 \
deno run -A simple.ts &
sleep 2
dig @127.0.0.1 -p 15353 "secret123.what.is.2+2.x" TXT +short
```

## PR policy

Doc-only fixes, typo corrections, link fixes, README prose
refinements: open a PR, will be merged after review.

Anything touching the running servers (`llm-dns-server/*.ts`)
or the protocol design: open an issue first. The DNS byte layout
is load-bearing — a malformed response is harder to debug from
the client side than a typical API error.