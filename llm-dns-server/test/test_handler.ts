/**
 * Unit test for llm-dns-server.ts — no root needed.
 * Stubs out ask() so we don't depend on the live LLM endpoint.
 */
import * as dp from "dns-packet";
import { Buffer } from "node:buffer";

// --- inline a copy of server logic with stubbed ask() ---
const TOKEN = "secret123";
const sess = new Map<string, string[]>();

function id() { return Math.random().toString(36).slice(2, 10); }
function chunk(s: string) { const c: string[] = []; for (let i = 0; i < s.length; i += 200) c.push(btoa(s.slice(i, i + 200))); return c; }

async function ask(q: string): Promise<string> {
  return `STUB(${q})`;
}

function buildResp(q: dp.DnsQuestion, data: string, id: number) {
  const bufs: Buffer[] = [];
  for (let i = 0; i < data.length; i += 255) {
    bufs.push(Buffer.from(data.slice(i, i + 255), "utf8"));
  }
  return new Uint8Array(dp.encode({
    id, type: "response", flags: dp.AUTHORITATIVE_ANSWER,
    questions: [q],
    answers: [{ name: q.name, type: "TXT", class: "IN", ttl: 60, data: bufs }],
  }));
}

async function handle(raw: Uint8Array) {
  const p = dp.decode(Buffer.from(raw));
  const q = p.questions[0];
  const name = q.name;
  const m = name.match(/^c\.(\d+)\.(\w+)$/);
  if (m) {
    const chunks = sess.get(m[2]!) ?? [];
    return buildResp(q, chunks[+m[1]!] ?? "bad", p.id);
  }
  if (!name.startsWith(TOKEN + ".")) return buildResp(q, "auth fail", p.id);
  const question = name.slice(TOKEN.length + 1).split(".").slice(0, -1).join(" ");
  const answer = await ask(question);
  const chunks = chunk(answer);
  const sid = id();
  sess.set(sid, chunks);
  return buildResp(q, `${chunks.length} ${sid}`, p.id);
}

// --- helpers ---
function txt(name: string, id = 0xbeef) {
  return new Uint8Array(dp.encode({
    id, type: "query", flags: 0,
    questions: [{ name, type: "TXT", class: "IN" }],
    answers: [],
  }));
}
function readTxt(resp: Uint8Array): string {
  const p = dp.decode(Buffer.from(resp));
  const a = p.answers[0];
  const bufs: Buffer[] = a.data as Buffer[];
  return Buffer.concat(bufs.map(b => Buffer.from(b))).toString("utf8");
}

// --- tests ---
let pass = 0, fail = 0;
function assert(cond: boolean, label: string) {
  if (cond) { console.log(`  ✓ ${label}`); pass++; }
  else      { console.log(`  ✗ ${label}`); fail++; }
}

console.log("Test 1: 认证失败 (wrong token)");
{
  const r = await handle(txt("wrong.hello.x", 1));
  assert(readTxt(r) === "auth fail", `body = ${JSON.stringify(readTxt(r))}`);
}

console.log("Test 2: 首次查询 → N sid");
let sid = "";
{
  const r = await handle(txt("secret123.hello.world.x", 2));
  const body = readTxt(r);
  assert(/^\d+ \w+$/.test(body), `body = "${body}"`);
  sid = body.split(" ")[1];
  assert(sess.has(sid), `session stored, sid=${sid}`);
}

console.log("Test 3: 取块 c.0.<sid> → base64");
{
  const r = await handle(txt(`c.0.${sid}.`, 3));
  const body = readTxt(r);
  const decoded = atob(body);
  assert(decoded === "STUB(hello world)", `decoded = "${decoded}"`);
}

console.log("Test 4: 取块越界 → bad");
{
  const r = await handle(txt(`c.99.${sid}.`, 4));
  assert(readTxt(r) === "bad", `body = "${readTxt(r)}"`);
}

console.log("Test 5: 取块不存在的 sid → bad");
{
  const r = await handle(txt(`c.0.nosuch.`, 5));
  assert(readTxt(r) === "bad", `body = "${readTxt(r)}"`);
}

console.log(`\n${pass} passed, ${fail} failed`);
Deno.exit(fail === 0 ? 0 : 1);
