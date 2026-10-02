import * as dp from "npm:dns-packet@5.6.1";
import { Buffer } from "node:buffer";
import dgram from "node:dgram";

const PORT = parseInt(Deno.env.get("DNS_PORT") ?? "53", 10);

const reply = (raw: Uint8Array) => {
  const p = dp.decode(Buffer.from(raw));
  const q = p.questions[0];
  const echo = q.name.replace(/\.[^.]+$/, "");
  const bufs: Buffer[] = [];
  for (let i = 0; i < echo.length; i += 255) bufs.push(Buffer.from(echo.slice(i, i + 255), "utf8"));
  return new Uint8Array(dp.encode({
    id: p.id, type: "response", flags: dp.AUTHORITATIVE_ANSWER,
    questions: [q],
    answers: [{ name: q.name, type: "TXT", class: "IN", ttl: 60, data: bufs }],
  }));
};

const sock = dgram.createSocket("udp4");
sock.on("message", (b, r) => sock.send(reply(b), r.port, r.address));
sock.on("error", e => console.error(e));
sock.bind(PORT, () => console.log(`DNS echo on :${PORT}`));