---
name: 2-dns-tunneling-50-line-demo
description: What DNS tunneling means, why DNS works as a covert channel (UDP/53 is allowed everywhere, payloads aren't inspected, you control the answer), and a 50-line walkthrough of the principle — the same skeleton that powers this repo's `echo.ts` and `simple.ts`.
type: summary
---

# Core Content

core_features:

- DNS tunneling = using DNS as a data channel, not as a name resolver; both query and answer carry opaque user payloads
- Three reasons DNS works as a covert channel: UDP/53 is permitted on every network; most networks don't parse payloads; the answer comes from a server you control
- Famous tools: iodine (NULL-record queries, base128/base32 subdomains), dnscat2 (TXT records with session multiplexing), OzymanDNS (base32 A-records for one-way exfiltration)
- The repo's `echo.ts` (22 lines) and `simple.ts` (53 lines) are the canonical production version of the pattern; LLM-over-DNS is a natural fit because TXT records carry arbitrary text
- 50-line demo: `dp.decode → strip trailing label → split into ≤255-byte Buffer chunks → dp.encode with AA flag → sock.send`
- Network defenses: force DNS to your resolver + firewall block direct 53, inspect payloads (long high-entropy subdomains), rate-limit and cap TXT size, require DNSSEC validation, deploy DoH

# Key Information

highlights:

- UDP/53 is allowed on every network since 1995 because the alternative (no DNS = no Internet) is unacceptable — captive portals, hotel WiFi, corporate firewalls all let it through
- Most networks log the NAMES that resolve, not the FULL payloads; a query like `aaaa.bbbb.cccc.example.com` looks normal unless someone manually decodes base32 subdomains
- Once you own a zone (`example.com`), you can make it answer any TXT query — the client just needs the zone name and the server IP
- DNS is slow, payloads are small, round-trips are chatty — but for low-and-slow exfiltration (MB/day) nothing beats it
- The 50-line demo uses `dns-packet` (npm) + `node:dgram` + `node:buffer`; total data path is 4 lines
- Defenses: force DNS to internal resolver + block direct 53 egress; inspect for high-entropy subdomains; cap answers at <200 bytes; require DNSSEC validation; deploy DoH for clients
- DoH is the defense side of the same coin: same encryption-in-the-wait idea, just used to prevent inspection rather than enable it
- The LLM-over-DNS pattern in this repo is morally identical to `dnscat2` but with the chat protocol replaced by an LLM API call

# Use Cases

use_cases:

- Understanding why corporate firewalls can't block UDP/53 without breaking the Internet
- Auditing a network for DNS exfiltration: high-entropy subdomains, large TXT answers, NXDOMAIN spikes
- Building a research/educational DNS-over-DNS demo without touching anything illegal
- Designing defenses against exfiltration (the defender side of the same protocol)
- Bootstrapping connectivity in a restricted network (captive portal, sanctioned region) where only DNS egress is permitted
- Comparing DNS tunneling tools (iodine, dnscat2, OzymanDNS) to the LLM-over-DNS variant

# Related Resources

official:
  website: https://x-cmd.com/mod/dns
  repo: https://github.com/x-cmd/dns
related:
  iodine: https://github.com/yarrick/iodine
  dnscat2: https://github.com/iagox86/dnscat2
  dnscurve: https://dnscurve.org/
  rfc1035: https://datatracker.ietf.org/doc/html/rfc1035
  walkthrough_code: https://github.com/x-cmd/dns/blob/main/llm-dns-server/echo.ts

# Summary

DNS tunneling is the use of DNS as a data channel, not as a name resolver. Both query and answer carry opaque user payloads; the actual name resolution work is incidental. Three reasons make DNS the most-abused protocol on the Internet for exfiltration and tunneling: UDP/53 is allowed on every network (captive portals, corporate firewalls all let it through because the alternative is no Internet); most networks don't parse payloads (they log NAMES, not full bytes); the answer comes from a server you control (you own a zone, you answer whatever you want). The famous tools — iodine (NULL-record queries with base128/base32 subdomains), dnscat2 (TXT records with session multiplexing for interactive shells), OzymanDNS (base32 A-records for one-way exfiltration) — are all variations on the same theme. This repo's `echo.ts` (22 lines) and `simple.ts` (53 lines) are the same pattern with the chat payload replaced by an LLM response; the 50-line demo walks through the four essential steps: parse the UDP query, strip the trailing label, split into ≤255-byte Buffer chunks (dns-packet 256-byte bug workaround), encode with AA flag, send back. Defenses: force DNS to an internal resolver and block direct egress on 53; inspect for high-entropy subdomains and oversized TXT answers; require DNSSEC validation; deploy DoH for clients. DoH is the defense side of the same encryption-in-the-wait idea. See [1. Safer DNS](./1-safer-dns.en.md) for DoH/DoT/DoQ and [0. DNS overview](./0-dns-overview.en.md) for the protocol surface this assumes.