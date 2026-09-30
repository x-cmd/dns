import * as dp from "npm:dns-packet@5.6.1";
import { Buffer } from "node:buffer";
import dgram from "node:dgram";

const API_KEY    = Deno.env.get("OPENAI_API_KEY") ?? "";
const API_BASE   = Deno.env.get("OPENAI_BASE_URL") ?? "https://api.minimaxi.com/v1";
const MODEL      = Deno.env.get("OPENAI_MODEL")    ?? "MiniMax-M3";
const AUTH_TOKEN = Deno.env.get("DNS_AUTH_TOKEN")  ?? "secret123";
const DNS_PORT   = parseInt(Deno.env.get("DNS_PORT") ?? "53", 10);

const SOURCE_CHUNK_SIZE     = 186;
const TXT_CHAR_STRING_LIMIT = 255;
const LLM_MAX_TOKENS        = 500;
const ANSWER_CACHE_MAX_SIZE = 256;

const sessions   = new Map<string, string[]>();
const answerCache = new Map<string, string[]>();

function newSessionId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function encodeToBase64Chunks(text: string): string[] {
  const chunks: string[] = [];
  for (let offset = 0; offset < text.length; offset += SOURCE_CHUNK_SIZE) {
    const slice = text.slice(offset, offset + SOURCE_CHUNK_SIZE);
    chunks.push(btoa(unescape(encodeURIComponent(slice))));
  }
  return chunks;
}

async function callLlm(question: string): Promise<string> {
  if (!API_KEY) return "no key";
  try {
    const response = await fetch(`${API_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content: question }],
        max_tokens: LLM_MAX_TOKENS,
      }),
    });
    if (!response.ok) {
      return `err ${response.status}: ${(await response.text()).slice(0, 120)}`;
    }
    const llmJson = await response.json();
    return llmJson.choices?.[0]?.message?.content ?? "empty";
  } catch (error) {
    return `net err: ${(error as Error).message}`;
  }
}

function buildTxtResponse(question: dp.DnsQuestion, txtData: string, packetId: number): Uint8Array {
  const charStrings: Buffer[] = [];
  for (let offset = 0; offset < txtData.length; offset += TXT_CHAR_STRING_LIMIT) {
    charStrings.push(Buffer.from(txtData.slice(offset, offset + TXT_CHAR_STRING_LIMIT), "utf8"));
  }
  const packetBytes = dp.encode({
    id: packetId,
    type: "response",
    flags: dp.AUTHORITATIVE_ANSWER,
    questions: [question],
    answers: [{ name: question.name, type: "TXT", class: "IN", ttl: 60, data: charStrings }],
  });
  return new Uint8Array(packetBytes);
}

async function handleDnsQuery(rawBytes: Uint8Array): Promise<Uint8Array | null> {
  let packet: dp.DnsPacket;
  try { packet = dp.decode(Buffer.from(rawBytes)); } catch { return null; }
  const question = packet.questions?.[0];
  if (!question) return null;
  const name = question.name;

  const chunkMatch = name.match(/^c\.(\d+)\.(\w+)$/);
  if (chunkMatch) {
    const storedChunks = sessions.get(chunkMatch[2]!) ?? [];
    return buildTxtResponse(question, storedChunks[+chunkMatch[1]!] ?? "bad", packet.id);
  }

  if (!name.startsWith(AUTH_TOKEN + ".")) return buildTxtResponse(question, "auth fail", packet.id);
  const userQuestion = name.slice(AUTH_TOKEN.length + 1).split(".").slice(0, -1).join(" ");
  if (!userQuestion) return buildTxtResponse(question, "empty", packet.id);

  let base64Chunks = answerCache.get(userQuestion);
  if (!base64Chunks) {
    const llmAnswer = await callLlm(userQuestion);
    base64Chunks = encodeToBase64Chunks(llmAnswer);
    if (answerCache.size >= ANSWER_CACHE_MAX_SIZE) {
      const oldestKey = answerCache.keys().next().value;
      if (oldestKey !== undefined) answerCache.delete(oldestKey);
    }
    answerCache.set(userQuestion, base64Chunks);
  }

  const sessionId = newSessionId();
  sessions.set(sessionId, base64Chunks);

  return buildTxtResponse(question, `${base64Chunks.length} ${sessionId}`, packet.id);
}

const socket = dgram.createSocket("udp4");
socket.on("message", (buffer, remoteInfo) => {
  handleDnsQuery(buffer).then(response => {
    if (response) socket.send(response, remoteInfo.port, remoteInfo.address);
  });
});
socket.on("error", (error) => console.error("udp error:", error));
socket.bind(DNS_PORT, () => {
  console.log(`DNS-LLM on :${DNS_PORT}  base=${API_BASE}  model=${MODEL}  token=${AUTH_TOKEN}`);
});
