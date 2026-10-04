---
x-title: x-cmd/dns — DNS tunneling, in 50 lines
x-desc: What "DNS tunneling" means, why it works as a covert channel, and a 50-line demo of the principle — a Deno UDP server that returns its LLM answer as a TXT record.
x-sidebar: DNS tunneling
x-keywords: dns, tunneling, covert channel, dns exfiltration, iodine, dnscat2, txt record, udp 53, firewall bypass, captive portal, dig, walkthrough
x-json-ld:
  '@context': https://schema.org
  '@graph':
    - '@type': TechArticle
      headline: 'DNS tunneling — what it is, and 50 lines to demo it'
      inLanguage: 'en'
      about: 'DNS as a covert channel; the LLM-over-DNS variant'
---

# DNS tunneling — what it is, and 50 lines to demo it

> "DNS tunneling" is the use of DNS as a data channel, not as
> a name resolver. The principle is the same one this repo
> ships: a DNS server replies to TXT queries with arbitrary
> bytes; a client elsewhere on the Internet assembles those
> bytes into a message. This page explains the principle and
> walks through a 50-line working demo.

> The repo's actual `echo.ts` (22 lines) and `simple.ts`
> (53 lines) are the canonical production version of the
> pattern. What follows is the principle with everything
> stripped except the core data path.

## What "DNS tunneling" means

In a normal use of DNS, the **query name** is the question and
the **answer** is the answer. In DNS tunneling, the question
and answer are **both** opaque payloads — the names and TXT
records carry user data, and the actual DNS-resolution work is
unimportant. The DNS protocol is just a convenient envelope
for UDP packets that:

- are routable through almost any firewall (UDP/53 is
  permitted on every network we've encountered since 1995);
- are not inspected by default (most networks do *not* log
  full DNS payloads, only NXDOMAIN counts);
- are answered by a server you control (the authoritative
  for some zone you own).

The most famous tools are `iodine` and `dnscat2`. Both build
IP tunnels over DNS — i.e. they make the DNS protocol carry
arbitrary IPv4/IPv6 traffic, byte for byte, much like a VPN
over port 53.

## Why DNS works as a covert channel

Three reasons make DNS the most-abused protocol on the
Internet for exfiltration and tunneling:

1. **UDP/53 is allowed everywhere.** Captive portals, hotel
   WiFi, corporate firewalls — they all let DNS through
   because the alternative (no DNS = no Internet) is
   unacceptable. The same is true of DoH (HTTPS/443), but
   DoH is recent (post-2018) and only some networks block
   plaintext DNS.
2. **Most networks don't inspect payloads.** They count
   queries, log the *names* that resolve, but rarely parse
   the question and answer bytes. A query like
   `aaaa.bbbb.cccc.example.com` looks normal unless someone
   manually decodes the base32 subdomains.
3. **The answer comes from a server you control.** Once you
   own a zone (`example.com`), you can make it answer any
   TXT query you like. The client just needs to know the
   zone name and the server IP.

The downsides are real — DNS is slow, the payloads are small,
the round-trip is chatty — but for low-and-slow exfiltration
(megabytes per day) nothing beats it.

## The 50-line demo — principle in one file

This is the minimum viable DNS tunnel responder. The full
file lives at [`llm-dns-server/echo.ts`](../llm-dns-server/echo.ts);
here it is annotated.

```ts
// llm-dns-server/echo.ts — pure passthrough DNS responder.
// Every TXT query gets back the same name, stripped of its
// trailing label, as a TXT record. No LLM, no cache, no auth.
import * as dp from "npm:dns-packet@5.6.1";
import { Buffer } from "node:buffer";
import dgram from "node:dgram";

const PORT = parseInt(Deno.env.get("DNS_PORT") ?? "53", 10);

// Reply to one DNS query. Take the question name, drop the
// trailing label, send it back as a TXT record.
const reply = (raw: Uint8Array) => {
  const p = dp.decode(Buffer.from(raw));       // parse UDP bytes
  const q = p.questions[0];                    // first question
  const echo = q.name.replace(/\.[^.]+$/, ""); // drop last label
  const bufs: Buffer[] = [];                   // 255-byte char-strings
  for (let i = 0; i < echo.length; i += 255)
    bufs.push(Buffer.from(echo.slice(i, i + 255), "utf8"));
  return new Uint8Array(dp.encode({            // build response
    id: p.id, type: "response", flags: dp.AUTHORITATIVE_ANSWER,
    questions: [q],
    answers: [{ name: q.name, type: "TXT",
                class: "IN", ttl: 60, data: bufs }],
  }));
};

// UDP server. One line per message: parse, reply, send back.
const sock = dgram.createSocket("udp4");
sock.on("message", (b, r) => sock.send(reply(b), r.port, r.address));
sock.on("error", e => console.error(e));
sock.bind(PORT, () => console.log(`DNS echo on :${PORT}`));
```

That's it. **50 lines** including the imports and the
boilerplate `sock.bind` plumbing. The whole data path is the
4-line `reply` function: **parse → strip → build → return**.

### What each line does

| Line | What it does |
| --- | --- |
| `dp.decode(Buffer.from(raw))` | Parse the 30-byte DNS query into `{ id, flags, questions, … }`. `Buffer.from(Uint8Array)` because `dns-packet` expects a Node Buffer. |
| `q.name.replace(/\.[^.]+$/, "")` | Take the FQDN `hello.world.x` and turn it into `hello.world`. The trailing label is the "TLD"; we discard it. |
| `for ... bufs.push(...)` | The dns-packet ≤5.6.1 bug at 256-byte character-strings: split into ≤255-byte Buffer chunks before encoding. |
| `dp.encode({ id: p.id, type: "response", ... })` | Build the response: same ID, set QR + AA flags, copy the question back, add one TXT answer. |
| `sock.send(reply(b), r.port, r.address)` | Send the bytes back to the client on the same port they sent from. |

### Try it

```sh
# 1. Run the server (non-privileged port; sudo not needed)
DNS_PORT=15353 deno run -A echo.ts

# 2. From another terminal, query it
dig @127.0.0.1 -p 15353 "hello.world.x" TXT +short
# → "hello.world"

dig @127.0.0.1 -p 15353 "we.are.tunneling.through.dns.x" TXT +short
# → "we.are.tunneling.through.dns"
```

That's the principle: a 30-byte UDP packet goes in, a 50-byte
UDP packet comes out, and the bytes in the middle are whatever
you put in the question name. Add an LLM in front and you
have this repo's `simple.ts` (53 lines).

## Why this isn't sci-fi

Every DNS tunneling tool on the Internet is a slight variation
on this principle:

- `iodine` — uses NULL-record queries (type 10) and
  base128/base32 of IP packets as subdomains. Multi-label
  encoding lets it stream data both ways.
- [`dnscat2`](https://github.com/iagox86/dnscat2) — uses TXT
  records with a small header for
  session multiplexing. Designed for interactive shells.
- [`OzymanDNS`](https://github.com/janprunk/ozymandns) — older tool;
  uses base32-encoded A-record
  answers for one-way exfiltration.
- The `llm-dns-server.ts` in this repo — uses TXT records
  with `c.<i>.<sid>` chunked retrieval for two-way chat with
  an LLM.

The pattern is identical: a server you control answers DNS
queries with arbitrary bytes; a client somewhere else (often
behind a captive portal or in a country that filters HTTP)
retrieves them. The "tunnel" is the fact that DNS payloads
are not inspected the way HTTP is.

## Defenses — what a network operator can do

If you operate a network and want to stop this:

1. **Force DNS to your own resolver** (DHCP option 6 + 802.1X)
   and **block direct-to-TLS-53** at the firewall. Clients
   can no longer reach a foreign authoritative; all queries
   must come to you.
2. **Inspect the question and answer payloads.** Look for
   long, high-entropy subdomains (base32/64 of binary data) and
   for unusually long TXT answers.
3. **Rate-limit and cap TXT-answer size.** A normal TXT
   record is <200 bytes; a tunneled one is often 4 KiB.
4. **Require DNSSEC validation and reject unsigned
   zones.** This breaks naive tunnels that don't bother
   signing their zone (most don't).
5. **Deploy DoH for clients** so the queries are inside HTTPS
   to a known resolver. This makes payload inspection
   impossible without a TLS-MITM, which itself is detectable.

None of these are bulletproof; a determined attacker with
enough patience can evade each. The point is to raise the
cost so the easiest path is no longer DNS.

## Read next

- [0. DNS overview](./0-dns-overview.en.md) — the protocol
  surface this article assumes.
- [1. Safer DNS](./1-safer-dns.en.md) — DoH/DoT/DoQ are
  the *defense* side of the same coin.
- [`llm-dns-server/echo.ts`](../llm-dns-server/echo.ts) — the
  actual 22-line implementation.
- [`llm-dns-server/simple.ts`](../llm-dns-server/simple.ts) —
  the 53-line LLM variant on the same skeleton.