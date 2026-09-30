import * as dp from "dns-packet";
import { Buffer } from "node:buffer";

// Reproduce the actual case: 267-byte b64 string
const s = "P".repeat(267);
try {
  const r = dp.encode({
    id: 1, type: "response", flags: dp.AUTHORITATIVE_ANSWER,
    questions: [{ name: "x", type: "TXT", class: "IN" }],
    answers: [{ name: "x", type: "TXT", class: "IN", ttl: 60, data: s }],
  });
  const p = dp.decode(Buffer.from(r));
  const data = (p.answers[0].data as Buffer[]).map(b => Buffer.from(b).toString("utf8")).join("");
  console.log("string form: roundtrip len", data.length, "match:", data === s);
} catch (e) {
  console.log("string form ERR:", (e as Error).message);
}

// Now try with Buffer wrapper
const r2 = dp.encode({
  id: 1, type: "response", flags: dp.AUTHORITATIVE_ANSWER,
  questions: [{ name: "x", type: "TXT", class: "IN" }],
  answers: [{ name: "x", type: "TXT", class: "IN", ttl: 60, data: [Buffer.from(s)] }],
});
const p2 = dp.decode(Buffer.from(r2));
const data2 = (p2.answers[0].data as Buffer[]).map(b => Buffer.from(b).toString("utf8")).join("");
console.log("buffer form: roundtrip len", data2.length, "match:", data2 === s);

// also try with shorter, realistic 25-char b64
const t = "U1RVQihoZWxsbyB3b3JsZCl=";
const r3 = dp.encode({id:1,type:"response",flags:dp.AUTHORITATIVE_ANSWER,questions:[{name:"x",type:"TXT",class:"IN"}],answers:[{name:"x",type:"TXT",class:"IN",ttl:60,data:t}]});
const p3 = dp.decode(Buffer.from(r3));
const d3 = (p3.answers[0].data as Buffer[]).map(b => Buffer.from(b).toString("utf8")).join("");
console.log("short string: len", d3.length, "match:", d3 === t);
