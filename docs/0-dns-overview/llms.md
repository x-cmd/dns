---
name: 0-dns-overview
description: DNS protocol reference — what it is, the iterative/recursive query lifecycle, record types (A/AAAA/CNAME/MX/NS/TXT/SRV/CAA/OPT), packet layout with name compression, TTL-based caching, and what DNS does NOT do (no transport security, no authentication, no policy).
type: summary
---

# Core Content

core_features:

- DNS is a distributed hierarchical database mapping names → identifiers
- Port 53; UDP for normal queries, TCP for large responses and zone transfers
- Query lifecycle: stub resolver → recursive resolver → root → TLD → authoritative
- Record types that matter: A, AAAA, CNAME, MX, NS, TXT, SRV, CAA, OPT (EDNS0)
- TXT is the most permissive type — free-form text, used for SPF/DKIM/DMARC and abused for covert channels
- Name compression (0xC0 pointer) keeps small queries small
- TTL is the resolver's caching promise; negative caching uses SOA MINIMUM
- 512-byte default UDP payload; 1232-byte practical limit with EDNS0 to avoid IP fragmentation

# Key Information

highlights:

- "Iterative query, recursive answer" defines the protocol: the client makes one call, the resolver does the walking
- DNS has NO transport security — plaintext UDP/53 is the default; anybody on path can read and forge answers
- DNS has NO authentication — DNSSEC signs the chain but deployment is partial
- DNS has NO policy — resolvers decide caching, filtering, logging; no protocol-level no-logging flag
- A DNS header is 12 bytes: ID, FLAGS, QDCOUNT, ANCOUNT, NSCOUNT, ARCOUNT
- The "13 root servers" number is operational, not protocol — each anycast instance has hundreds of endpoints
- TTL is the unit of caching economy: 300s for fast-changing, 86400s for stable records; misconfigured TTLs are how real clients break

# Use Cases

use_cases:

- Understanding why a website takes 200ms to load (DNS adds one round-trip per uncached name)
- Diagnosing "the site works from my house but not the office" as a resolver / caching issue
- Debugging email delivery with `dig MX` / `dig TXT` for SPF/DKIM/DMARC
- Auditing third-party SaaS dependencies (every API hostname is a DNS dependency)
- Building AI agents / proxies that need to talk DNS to surface API metadata
- Setting up split-horizon DNS for a corporate network

# Related Resources

official:
  website: https://x-cmd.com/mod/dns
  repo: https://github.com/x-cmd/dns
related:
  rfc1035: https://datatracker.ietf.org/doc/html/rfc1035
  rfc6891: https://datatracker.ietf.org/doc/html/rfc6891 (EDNS0)
  rfc4033: https://datatracker.ietf.org/doc/html/rfc4033 (DNSSEC intro)
  root_servers: https://www.iana.org/domains/root/servers
  dig: https://man.openbsd.org/dig.1

# Summary

DNS is the distributed, hierarchical database that maps human-readable names (`www.example.com`) to machine-routable identifiers (IPv4/IPv6 addresses, mail exchangers, service locators, raw text). It runs on UDP/53 for small queries and TCP/53 for large ones, with a 12-byte fixed header and a 4-section body (question, answer, authority, additional). The defining feature of the protocol is the split between the **iterative query** (the resolver walks root → TLD → authoritative, each returning NS for the next level) and the **recursive answer** (the client gets one round-trip's worth of work). TXT records are the most permissive type — used for SPF/DKIM/DMARC and abused for covert channels (see [2. DNS tunneling](./2-dns-tunneling-50-line-demo.en.md)). Caching is what makes the system scale: the TTL field is the resolver's promise, and the root servers see only ~10% of queries because of intermediate resolver caches. What DNS does NOT do is the punchline: it has no transport security (plaintext UDP/53), no answer authentication (DNSSEC is partial), and no policy (resolvers decide everything). See [1. Safer DNS](./1-safer-dns.en.md) for DoH/DoT/DoQ/DNSSEC.