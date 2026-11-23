// Calls LLM providers in order (Gemini primary, Groq fallback). Each attempt has a timeout;
// a 5xx gets one retry, a Groq 429 with retry-after <= 5s gets one retry after waiting;
// anything else (long 429, timeout, bad JSON) moves to the next provider.
// If all fail we throw — there is never a canned or cached answer.
import { GoogleGenAI } from "@google/genai";
import Groq from "groq-sdk";

export type LLMRequest = { system: string; user: string; jsonSchema: object };
export type LLMResult<T> = { provider: string; model: string; data: T; latency_ms: number };

const TIMEOUT_MS = 10_000;

type Provider = {
  name: "gemini" | "groq";
  model: string | undefined;
  apiKey: string | undefined;
  call: (req: LLMRequest, model: string, apiKey: string, signal: AbortSignal) => Promise<string>;
};

const BASE: Provider[] = [
  {
    name: "gemini",
    model: process.env.GEMINI_MODEL,
    apiKey: process.env.GEMINI_API_KEY,
    async call(req, model, apiKey, signal) {
      const res = await new GoogleGenAI({ apiKey }).models.generateContent({
        model,
        contents: req.user,
        config: {
          systemInstruction: req.system,
          temperature: 0,
          responseMimeType: "application/json",
          responseJsonSchema: req.jsonSchema,
          abortSignal: signal,
        },
      });
      return res.text ?? "";
    },
  },
  {
    name: "groq",
    model: process.env.GROQ_MODEL,
    apiKey: process.env.GROQ_API_KEY,
    async call(req, model, apiKey, signal) {
      const res = await new Groq({ apiKey, maxRetries: 0, timeout: TIMEOUT_MS }).chat.completions.create(
        {
          model,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            // No schema text here: the prompt's examples show the exact JSON shape and Zod validates the reply.
            // Saves ~600 of Groq's free 8000 input tokens/min.
            { role: "system", content: `${req.system}\n\nReturn only one JSON object, same keys as the examples.` },
            { role: "user", content: req.user },
          ],
        },
        { signal },
      );
      return res.choices[0]?.message?.content ?? "";
    },
  },
];

const MAX_429_WAIT_MS = 5_000;
// retry-after is seconds (Groq sends e.g. "2" or "1.5"); null if missing or unreadable.
export function retryAfterMs(e: unknown): number | null {
  const v = (e as { headers?: Headers }).headers?.get?.("retry-after");
  const sec = v == null ? NaN : Number(v);
  return Number.isFinite(sec) && sec >= 0 ? Math.ceil(sec * 1000) : null;
}

// Extra models with their own free quotas, tried after the env model of the same provider
// (checked live on 24 Nov 2026; gemini-2.5-* are closed to new keys, gemini-3.5-flash timed out).
const EXTRA_MODELS = { gemini: ["gemini-3.5-flash-lite"], groq: ["openai/gpt-oss-120b", "openai/gpt-oss-20b"] };
// Order: Gemini env model → other Gemini → Groq env model → other Groq. Same parse/number check for all.
const PROVIDERS: Provider[] = BASE.flatMap((p) =>
  [...new Set([p.model, ...EXTRA_MODELS[p.name]])].map((model) => ({ ...p, model: p.model ? model : undefined })));

export class AllProvidersFailed extends Error {
  attempts: string[];
  constructor(attempts: string[]) {
    super(`All LLM providers failed: ${attempts.join(" | ")}`);
    this.attempts = attempts;
  }
}

// `parse` validates the raw text (JSON + Zod). If it throws, that provider counts as failed.
// `signal`: the caller's request; if the page is closed we stop instead of calling the next provider.
export async function callLLM<T>(req: LLMRequest, parse: (text: string) => T, signal?: AbortSignal): Promise<LLMResult<T>> {
  const attempts: string[] = [];
  for (const p of PROVIDERS) {
    if (!p.model || !p.apiKey) { attempts.push(`${p.name}/${p.model}: not configured`); continue; }
    for (let attempt = 1; attempt <= 2; attempt++) {
      if (signal?.aborted) throw new AllProvidersFailed([...attempts, "aborted by client"]);
      const started = Date.now();
      try {
        const text = await p.call(req, p.model, p.apiKey, signal ? AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]) : AbortSignal.timeout(TIMEOUT_MS));
        return { provider: p.name, model: p.model, data: parse(text), latency_ms: Date.now() - started };
      } catch (e) {
        const status = (e as { status?: number }).status;
        const line = `${p.name}/${p.model}#${attempt}: ${status ?? ""} ${Date.now() - started}ms ${(e as Error).message}`.slice(0, 200);
        console.warn("LLM attempt failed:", line); // logged even when a later provider succeeds
        attempts.push(line);
        if (attempt !== 1) break;
        if (status && status >= 500) continue; // a 5xx earns one retry
        // Groq 429 per-minute limit: wait as long as it asks, if that's short. A daily limit (minutes away) moves on.
        const wait = status === 429 && p.name === "groq" ? retryAfterMs(e) : null;
        if (wait === null || wait > MAX_429_WAIT_MS) break;
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }
  throw new AllProvidersFailed(attempts);
}
