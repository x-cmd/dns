import * as dp from "npm:dns-packet@5.6.1";
import { Buffer } from "node:buffer";
import dgram from "node:dgram";

const K     = Deno.env.get("OPENAI_API_KEY") ?? "";
const BASE  = Deno.env.get("OPENAI_BASE_URL") ?? "https://api.minimaxi.com/v1";
const MODEL = Deno.env.get("OPENAI_MODEL")    ?? "MiniMax-M3";
const TOKEN = Deno.env.get("DNS_AUTH_TOKEN")  ?? "secret123";
const PORT  = parseInt(Deno.env.get("DNS_PORT") ?? "53", 10);

const cache = new Map<string, string>();

const truncate = (s: string) => {
  const b = new TextEncoder().encode(s);
  if (b.length <= 255) return s;
  let cut = 255;
  while ((b[cut]! & 0xc0) === 0x80) cut--;
  return new TextDecoder().decode(b.subarray(0, cut));
};

const reply = async (raw: Uint8Array) => {
  const p = dp.decode(Buffer.from(raw));
  const q = p.questions[0];
  const name = q.name;
  if (!name.startsWith(TOKEN + ".")) return txt(q, "auth fail", p.id);
  const ask = name.slice(TOKEN.length + 1).split(".").slice(0, -1).join(" ");
  if (!ask) return txt(q, "empty", p.id);

  let ans = cache.get(ask);
  if (!ans) {
    const r = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${K}` },
      body: JSON.stringify({ model: MODEL, messages: [{ role: "user", content: ask }] }),
    });
    ans = truncate((await r.json()).choices?.[0]?.message?.content ?? "empty");
    cache.set(ask, ans);
  }
  return txt(q, ans, p.id);
};

function txt(q: dp.DnsQuestion, data: string, id: number): Uint8Array {
  return new Uint8Array(dp.encode({
    id, type: "response", flags: dp.AUTHORITATIVE_ANSWER,
    questions: [q],
    answers: [{ name: q.name, type: "TXT", class: "IN", ttl: 60, data }],
  }));
}

const sock = dgram.createSocket("udp4");
sock.on("message", (b, r) => reply(b).then(res => res && sock.send(res, r.port, r.address)));
sock.on("error", e => console.error(e));
sock.bind(PORT, () => console.log(`DNS-LLM-simple on :${PORT}`));
