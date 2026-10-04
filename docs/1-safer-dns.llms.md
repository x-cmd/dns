---
name: 1-safer-dns
description: The four ways to make DNS safe — DoT (RFC 7858, TCP/853), DoH (RFC 8484, HTTPS/443), DoQ (RFC 9250, UDP/853), and DNSSEC (RFC 4033+). Encrypted transport and authenticated answers are independent axes; both run in modern stacks.
type: summary
---

# Core Content

core_features:

- DoT (DNS-over-TLS): TLS 1.2/1.3 on TCP/853; length-prefixed DNS payloads on the TLS stream
- DoH (DNS-over-HTTPS): RFC 8484; DNS as the body of an HTTPS request/response; blends with web traffic; deployed in Firefox/Chrome/iOS/Android
- DoQ (DNS-over-QUIC): RFC 9250; QUIC on UDP/853 with DNS_STREAM frames; no head-of-line blocking, 0-RTT resumption
- DNSSEC: chain of signatures (signatures) from root to authoritative; solves cache poisoning and resolver-level MITM; does NOT encrypt the query
- ECS (EDNS0 Client Subnet): orthogonal privacy leak — exposes client /24 to authoritative even on DoH; Cloudflare masks the last octet; oDoH adds a relay
- Public resolvers (1.1.1.1, 9.9.9.9, 8.8.8.8) all deploy DoT+DoH+DNSSEC validation

# Key Information

highlights:

- DoH/DoT/DoQ encrypt the channel but do NOT authenticate the answer; DNSSEC authenticates the answer but does NOT encrypt — they are independent and complementary
- Root zone has been DNSSEC-signed since 2010; ~35% of TLDs and ~5% of second-level zones sign their zones
- DoH is the hardest to block because it's plain HTTPS on port 443 — DPI cannot distinguish a DoH request from any other HTTPS call to the same host
- DoT on TCP/853 is a single clean signal for DPI; some firewalls block it explicitly
- DNSSEC does not hide the query — a validating resolver still knows what you asked; only oDoH (draft) hides both IP and query from the resolver
- Cloudflare 1.1.1.1 masks ECS by zeroing the last octet; Quad9 blocks known-malicious names; Google 8.8.8.8 logs more
- Modern OSes validate DNSSEC by default; older ones (legacy glibc, /etc/resolv.conf) need an explicit flag
- The Kaminsky attack class (2008) is what pushed DNSSEC deployment — without it, cache poisoning was trivial

# Use Cases

use_cases:

- Configuring a personal machine's DNS to a DoH-capable public resolver with DNSSEC validation
- Setting up a recursive validating resolver on an enterprise network (unbound, knot-resolver)
- Auditing which clients on a network still leak DNS queries in plaintext
- Building a network policy that allows DoH/DoT and blocks plaintext 53 to authoritative resolvers
- Diagnosing "this hostname doesn't resolve" issues caused by DNSSEC validation rejecting bad signatures
- Migrating from BIND-style authoritative + recursive to a split setup (authoritative in one zone, recursive via DoH elsewhere)

# Related Resources

official:
  website: https://x-cmd.com/mod/dns
  repo: https://github.com/x-cmd/dns
related:
  rfc7858: https://datatracker.ietf.org/doc/html/rfc7858 (DoT)
  rfc8484: https://datatracker.ietf.org/doc/html/rfc8484 (DoH)
  rfc9250: https://datatracker.ietf.org/doc/html/rfc9250 (DoQ)
  rfc4033: https://datatracker.ietf.org/doc/html/rfc4033 (DNSSEC intro)
  odoh: https://datatracker.ietf.org/doc/draft-irtf-pearg-oblivious-dns/
  cloudflare_1111: https://1.1.1.1/
  quad9: https://www.quad9.net/

# Summary

Classic DNS is plaintext UDP/53 with no authentication and no policy. There are four fixes that are actually deployed. DoT (DNS-over-TLS, RFC 7858) puts a TLS session on TCP/853 — simple, but the single port is a clean DPI signal. DoH (DNS-over-HTTPS, RFC 8484) puts DNS as the body of an HTTPS request on 443 — indistinguishable from any other HTTPS call, deployed in every major browser and OS. DoQ (DNS-over-QUIC, RFC 9250) puts DNS in QUIC frames on UDP/853 — no head-of-line blocking, 0-RTT resumption, fewer deployments. DNSSEC (RFC 4033+) signs the entire chain from the root down — solves cache poisoning and resolver-level MITM, but does NOT encrypt. These are independent: DoH/DoT/DoQ encrypt the channel; DNSSEC authenticates the answer; modern stacks run both. ECS (EDNS0 Client Subnet) is a privacy leak orthogonal to all of the above — Cloudflare masks it, oDoH (draft) hides both IP and query from the resolver via a relay. See [2. DNS tunneling, in 50 lines](./2-dns-tunneling-50-line-demo.en.md) for the abuse case that explains why these fixes exist.