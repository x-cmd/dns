---
x-title: x-cmd/dns — DNS overview
x-desc: What DNS is, how a query goes from your machine to an authoritative answer, the record types that matter, and where DNS hides in every other protocol.
x-sidebar: DNS overview
x-keywords: dns, domain name, resolver, authoritative, glue, ttl, rrset, txt, mx, cname, dig, named, bind, knot
x-json-ld:
  '@context': https://schema.org
  '@graph':
    - '@type': TechArticle
      headline: 'DNS — what it is and how it works'
      inLanguage: 'en'
      about: 'The Domain Name System protocol and resolver architecture'
---

# DNS — what it is and how it works

> A one-page reference. Deeper dives on DoH / DoT / DNSSEC and
> on DNS as a covert channel live in
> [1. Safer DNS](./1-safer-dns.en.md) and
> [2. DNS tunneling, in 50 lines](./2-dns-tunneling-50-line-demo.en.md).

## What DNS is, in one sentence

DNS is a **distributed, hierarchical database** that maps human-
readable names (`www.example.com`) to machine-routable
identifiers (IPv4/IPv6 addresses, mail exchangers, service
locators, raw text, …). It runs on **port 53** — UDP for
normal queries, TCP for large responses and zone transfers.

## The query lifecycle

When you type `https://www.example.com` into a browser:

```
┌──────┐  1. check OS cache       ┌─────────────────────────┐
│ App  │ ───────────────────────► │ Stub resolver (glibc,  │
└──────┘                          │ systemd-resolved, …)   │
                                   └────────────┬────────────┘
                                                │ miss
                                                ▼
                                   ┌─────────────────────────┐
                                   │ Recursive resolver       │
                                   │ (ISP, 8.8.8.8, 1.1.1.1) │
                                   └────────────┬────────────┘
                                                │ iterative
        ┌───────────────────────────────────────┼──────────────────────────────┐
        ▼                       ▼               ▼                              ▼
  ┌───────────┐         ┌───────────┐    ┌───────────┐               ┌───────────────┐
  │ Root (.)  │ ──────► │ TLD (.com)│ ─► │ Authoritative              │ Authoritative │
  │ 13 IPs    │ refer   │ 13 IPs    │ refer   │ (example.com)             │ (the answer) │
  └───────────┘         └───────────┘    └───────────┘               └───────────────┘
```

The stub resolver at the OS level asks a **recursive
resolver** ("please give me the answer for `www.example.com`").
The recursive resolver then walks the hierarchy — root, TLD,
authoritative — each step returning NS records for the next
zone down. When it reaches the authoritative server for
`example.com`, it gets the A/AAAA record and walks back up,
caching each step.

The user sees one round-trip; the resolver does the rest. This
is the "iterative query, recursive answer" split that defines
DNS.

## Record types that matter

| Type | Code | What it answers | Example |
| --- | --- | --- | --- |
| A | 1 | IPv4 address | `93.184.216.34` |
| AAAA | 28 | IPv6 address | `2606:2800:220:1:248:1893:25c8:1946` |
| CNAME | 5 | Alias to another name | `www → example.com` |
| MX | 15 | Mail exchanger (with priority) | `10 mail.example.com.` |
| NS | 2 | Authoritative name servers | `ns1.example.com.` |
| TXT | 16 | Free-form text | SPF, DKIM, DMARC, arbitrary payloads |
| SRV | 33 | Service locator (host + port) | `_sip._tcp.example.com.` |
| CAA | 257 | Authorized CAs for this domain | `0 issue "letsencrypt.org"` |
| OPT | 41 | EDNS0 extension (DO bit, payload size) | `EDNS version 0, UDP 4096` |

TXT is the most permissive and the most abused — see
[2. DNS tunneling](./2-dns-tunneling-50-line-demo.en.md) for the
abuse case.

## The packet, in one paragraph

A DNS query is a tiny UDP datagram. Header is 12 bytes:
`ID (2) | FLAGS (2) | QDCOUNT (1 question) | ANCOUNT (0) |
NSCOUNT (0) | ARCOUNT (0)`. Each section that follows is a
list of **resource records**. A resource record has:

- **NAME** — either literal labels (`www`, `example`, `com`,
  terminator) or a 2-byte compression pointer
  (`0xC0 0x0C` → "go back to offset 12"). Compression is
  why a 30-byte query fits in 30 bytes instead of 60.
- **TYPE (2)** — A, AAAA, TXT, etc.
- **CLASS (2)** — almost always `IN` (Internet, value 1).
- **TTL (4)** — how long the answer can be cached.
- **RDLENGTH (2)** + **RDATA** — record-specific payload.

The maximum useful UDP payload (without EDNS0) is **512 bytes**.
With EDNS0, clients and servers negotiate up to 4096 bytes
(or 1232 bytes in practice — to avoid IP fragmentation).

## Caching and the TTL field

The TTL is the resolver's promise: "you can serve this answer
for the next N seconds without re-asking." A TTL of 300 means
"five minutes"; 86400 is "one day". Negative caching has its
own TTL (the SOA `MINIMUM` field, or a synthesized one for
NXDOMAIN).

Caching is what makes DNS scale. Without it, the root servers
would see every query on the Internet. With it, they see maybe
10% of the long tail.

## What's NOT in DNS

- **No transport security.** Classic DNS is plaintext UDP/53.
  Anybody on path can see and tamper with the answer. See
  [1. Safer DNS](./1-safer-dns.en.md) for DoT / DoH / DoQ.
- **No authentication of the answer.** A response can be
  forged. DNSSEC signs the chain; see
  [1. Safer DNS](./1-safer-dns.en.md) for the deploy status.
- **No built-in policy.** The resolver decides what to cache,
  what to filter, what to log. There is no protocol-level
  "no logging" flag.

## Read next

- [1. Safer DNS](./1-safer-dns.en.md) — DoH, DoT, DoQ, DNSSEC.
- [2. DNS tunneling, in 50 lines](./2-dns-tunneling-50-line-demo.en.md) —
  why DNS is a covert channel and how to build one.
- [`SKILL.md`](../SKILL.md) — run a DNS server yourself with
  the repo's source.