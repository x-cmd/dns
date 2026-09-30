import * as dp from "dns-packet";
import { Buffer } from "node:buffer";

const long = "a".repeat(200);
const r = dp.encode({
  id: 1, type: "response", flags: dp.AUTHORITATIVE_ANSWER,
  questions: [{ name: "x", type: "TXT", class: "IN" }],
  answers: [{ name: "x", type: "TXT", class: "IN", ttl: 60, data: long }],
});
console.log("200-byte string encoded length:", r.length);

const r2 = dp.encode({
  id: 1, type: "response", flags: dp.AUTHORITATIVE_ANSWER,
  questions: [{ name: "x", type: "TXT", class: "IN" }],
  answers: [{ name: "x", type: "TXT", class: "IN", ttl: 60, data: [Buffer.from(long)] }],
});
console.log("single buffer encoded length:", r2.length);

const r3 = dp.encode({
  id: 1, type: "response", flags: dp.AUTHORITATIVE_ANSWER,
  questions: [{ name: "x", type: "TXT", class: "IN" }],
  answers: [{ name: "x", type: "TXT", class: "IN", ttl: 60, data: [Buffer.from("aa"), Buffer.from("bb"), Buffer.from("cc")] }],
});
console.log("3 buffers last 15 hex:", r3.subarray(r3.length - 15).toString("hex"));
