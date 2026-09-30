import * as dp from "dns-packet";
import { Buffer } from "node:buffer";
import dgram from "node:dgram";

const [, , nameArg, portArg] = Deno.args;
const name = nameArg ?? "c.0.huo80tqg";
const port = parseInt(portArg ?? "15353", 10);

const q = dp.encode({
  id: 0xabcd,
  type: "query",
  flags: 0,
  questions: [{ name, type: "TXT", class: "IN" }],
});

const sock = dgram.createSocket("udp4");
const resp = await new Promise<Buffer>((resolve, reject) => {
  sock.once("message", (buf) => resolve(buf));
  sock.once("error", reject);
  sock.send(Buffer.from(q), port, "127.0.0.1");
  setTimeout(() => reject(new Error("timeout")), 3000);
});
sock.close();

console.log(`raw response: ${resp.length} bytes`);
console.log(`hex head: ${resp.subarray(0, 32).toString("hex")}`);
const parsed = dp.decode(resp);
console.log(`flags: 0x${parsed.flags.toString(16)}  rcode=${parsed.rcode}  answers=${parsed.answers.length}`);
for (const a of parsed.answers) {
  const data = (a.data as Buffer[]).map(b => Buffer.from(b).toString("utf8")).join("");
  console.log(`  answer: name=${a.name} type=${a.type} ttl=${a.ttl} data=${JSON.stringify(data)}  (raw bytes: ${data.length})`);
}
