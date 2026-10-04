import * as dp from "dns-packet";
import { Buffer } from "node:buffer";

const TOKEN = "secret123";
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
    ans = truncate(`STUB(${ask})`);
    cache.set(ask, ans);
  }
  return txt(q, ans, p.id);
};

function txt(q: dp.DnsQuestion, data: string, id: number) {
  return new Uint8Array(dp.encode({
    id, type: "response", flags: dp.AUTHORITATIVE_ANSWER,
    questions: [q],
    answers: [{ name: q.name, type: "TXT", class: "IN", ttl: 60, data }],
  }));
}

const mkTxt = (name: string, id = 0xbeef) => new Uint8Array(dp.encode({
  id, type: "query", flags: 0,
  questions: [{ name, type: "TXT", class: "IN" }], answers: [],
}));
const readTxt = (resp: Uint8Array) =>
  (dp.decode(Buffer.from(resp)).answers[0].data as Buffer[])
    .map(b => Buffer.from(b).toString("utf8")).join("");

let pass = 0, fail = 0;
const assert = (cond: boolean, label: string) => {
  if (cond) { console.log(`  ✓ ${label}`); pass++; }
  else      { console.log(`  ✗ ${label}`); fail++; }
};

console.log("Test 1: 认证失败");
assert(readTxt(await reply(mkTxt("wrong.x", 1))) === "auth fail", "");

console.log("Test 2: 单次查询直接返回答案");
cache.clear();
assert(readTxt(await reply(mkTxt("secret123.hello.world.x", 2))) === "STUB(hello world)", "");

console.log("Test 3: 缓存命中");
cache.set("hello world", "STUB(hello world)");
assert(readTxt(await reply(mkTxt("secret123.hello.world.x", 3))) === "STUB(hello world)", "");
assert(cache.has("hello world"), "still in cache");

console.log("Test 4: UTF-8 安全截断到 ≤255 字节");
const t = truncate("你".repeat(200));
assert(new TextEncoder().encode(t).length <= 255, `bytes=${new TextEncoder().encode(t).length}`);
assert(!t.includes("�"), "no replacement chars");

console.log("Test 5: 不超长不切");
assert(truncate("x".repeat(200)) === "x".repeat(200), "");

console.log(`\n${pass} passed, ${fail} failed`);
Deno.exit(fail === 0 ? 0 : 1);