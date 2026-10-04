---
x-title: x-cmd/dns — Safer DNS (DoH, DoT, DoQ, DNSSEC)
x-desc: The four ways to make DNS safe — encrypted transport (DoT/DoH/DoQ), authenticated answers (DNSSEC), and the deployment trade-offs of each.
x-sidebar: Safer DNS
x-keywords: dns, doh, dot, doq, dnssec, tls, quic, encrypted dns, privacy, ecs, edns, odoh, oblious
x-json-ld:
  '@context': https://schema.org
  '@graph':
    - '@type': TechArticle
      headline: 'Safer DNS — DoH, DoT, DoQ, DNSSEC'
      inLanguage: 'en'
      about: 'Encrypted transport and authenticated answers for DNS'
---

# Safer DNS — DoH, DoT, DoQ, DNSSEC

> Classic DNS is plaintext, unauthenticated, and policy-free.
> This page covers the four fixes that are actually deployed —
> their wire format, their threat model, and the operational
> trade-offs.

## The four fixes, in one table

| Fix | What it adds | Wire format | Status |
| --- | --- | --- | --- |
| **DoT** (DNS-over-TLS, RFC 7858) | Encrypted transport | TCP/853 | Deployed by ISPs and public resolvers |
| **DoH** (DNS-over-HTTPS, RFC 8484) | Encrypted transport, blends with web | HTTPS/443 | Deployed in Firefox, Chrome, iOS, Android |
| **DoQ** (DNS-over-QUIC, RFC 9250) | Encrypted transport over UDP | UDP/853 | Deployed by AdGuard, recent resolvers |
| **DNSSEC** (RFC 4033+) | Signed answers; chain of trust to root | Any transport | Signed root since 2010; deployment ~30% of TLDs |

They are **independent**: DoH/DoT/DoQ encrypt the channel but
do not authenticate the answer; DNSSEC authenticates the
answer but does not encrypt the channel. Modern stacks run
both.

## DoT — DNS-over-TLS

```
Client                          Resolver
  │─── TCP SYN ────────────────►│ :853
  │◄── TCP SYN-ACK ────────────│
  │─── TLS ClientHello ────────►│
  │◄── TLS handshake ──────────│
  │─── DNS query (TLS-wrapped) ►│
  │◄── DNS response ───────────│
```

**Wire**: a TLS 1.2/1.3 connection over **TCP/853**. Each
DNS query is a length-prefixed (2-byte big-endian) payload on
the TLS stream — same as the HTTP/1.1 framing trick.

**Pros**: simple, one TCP connection per resolver, easy to
  reason about, no web infra needed.

**Cons**: a single TCP/853 port is a clean signal for DPI
  ("this is DoT"); some corporate firewalls block it.

**Deployments**: `1.1.1.1` (Cloudflare), `8.8.8.8` (Google),
  Quad9, AdGuard — all accept TCP/853.

## DoH — DNS-over-HTTPS

```
GET /dns-query?dns=<base64url> HTTP/1.1
Host: 1.1.1.1
Accept: application/dns-message
```

or

```
POST /dns-query HTTP/1.1
Host: 1.1.1.1
Content-Type: application/dns-message
Content-Length: <n>

<raw DNS query bytes>
```

**Wire**: full HTTPS request, response is the raw DNS message
in the body. RFC 8484.

**Pros**: looks exactly like web traffic; very hard to block
  without blocking all HTTPS (which is impractical).

**Cons**: couples DNS to a single HTTP host (CDN-able, but
  more state than a single resolver); harder to debug
  ("curl the DoH endpoint").

**Deployments**: Firefox (since 2018), Chrome (since 2021),
iOS (since 2020, system-wide), Android (Private DNS), most
modern OSes. Public resolvers expose
`https://1.1.1.1/dns-query{,…}` and similar.

## DoQ — DNS-over-QUIC

```
Client                          Resolver
  │─── QUIC Initial ────────────►│ UDP/853
  │◄── QUIC handshake ──────────│
  │─── DNS_STREAM frame ────────►│
  │◄── DNS_STREAM frame ────────│
```

**Wire**: a QUIC connection on **UDP/853**, with DNS_STREAM
frames carrying the queries (RFC 9250). QUIC's stream
multiplexing means one connection can host many concurrent
queries.

**Pros**: combines TLS 1.3 encryption, no head-of-line blocking
  (one slow query doesn't stall the others), 0-RTT resumption.

**Cons**: UDP/853 is even more obviously "this is encrypted
  DNS" than DoT; fewer deployments than DoH.

**Deployments**: AdGuard, NextDNS, recent Knot / PowerDNS
resolvers. Browser support thin.

## DNSSEC — signed answers

DNSSEC is the orthogonal axis: it **authenticates** the
answer (so a MITM can't forge `evil.example.com → 1.2.3.4`),
but it doesn't encrypt the query.

The trust chain starts at the root (`.` is signed). Every TLD
that opts in (`.com`, `.net`, `.org`, ~90% of country TLDs)
signs its zone and publishes a DS record at the parent. The
second-level zone (`example.com`) signs its records and
publishes a DS in `.com`. A validating resolver walks the chain
and rejects any answer whose signature doesn't verify.

**What DNSSEC solves**: cache poisoning (the Kaminsky attack
class), transparent MITM by a hostile resolver.

**What DNSSEC does NOT solve**: it doesn't encrypt, doesn't
hide the *query*, and a validating resolver still trusts the
TLD operator to delegate honestly to second-level zones.

**Status**: 100% of the root zone is signed (since 2010);
about 35% of TLDs; about 5% of second-level zones. Most public
resolvers (Cloudflare, Google, Quad9) validate by default.

## The privacy layer nobody talks about — ECS and EDNS

EDNS0 **Client Subnet** (ECS) lets a recursive resolver tell
the authoritative *which client subnet* the query came from,
so the authoritative can return geo-distributed answers. The
trade-off: ECS is a privacy leak (the authoritative learns
your /24 IPv4 prefix even on DoH/DoQ).

Modern DoH/DoQ resolvers either strip it on the way out
(Cloudflare's `1.1.1.1` masks the last octet) or don't send
it at all. **Oblivious DoH** (`oDoH`, draft-irtf-pearg-
oblivious-dns) goes further: a relay sits between you and the
resolver so neither party can correlate your IP with your
query. Adoption is early.

## What you should actually configure

For a personal machine:

1. **Use a DoH-capable public resolver.
   - `1.1.1.1` (Cloudflare) — audited, fast, ECS-masked.
   - `9.9.9.9` (Quad9) — blocks known-malicious domains.
   - `8.8.8.8` (Google) — broadest reach, more logging.
2. **Enable DNSSEC validation in the OS.** Modern OSes do this
   by default; older ones (`/etc/resolv.conf` with
   `dnssec` option, or `unbound` with `validator`) need an
   explicit flag.
3. **Don't roll your own resolver** unless you're operating
   one. Public resolvers are well-run and audited.

For an enterprise:

1. **Run your own validating recursive resolver.** `unbound`
   or `knot-resolver` on the same network; point clients at
   it. Validate DNSSEC; do not forward to a public resolver
   unless policy allows.
2. **Decide DoT vs DoH for clients.** DoT is easier on
   routers; DoH survives middleboxes better. Most modern
   resolvers accept both.
3. **Be ready for "this hostname doesn't resolve" tickets.**
   Caching behavior changes; you'll get fewer but more
   puzzling errors.

## Read next

- [2. DNS tunneling, in 50 lines](./2-dns-tunneling-50-line-demo.en.md) —
  the abuse case for unencrypted DNS; DoH is the same fix in
  reverse.
- [`SKILL.md`](../SKILL.md) — run a DNS server in this repo;
  it'll speak plaintext DNS on whatever port you bind.