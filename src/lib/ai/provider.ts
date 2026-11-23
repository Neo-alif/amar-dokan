// Calls LLM providers in order (Gemini primary, Groq fallback). Each attempt has a timeout;
// a 5xx gets one retry; anything else (429, timeout, bad JSON) moves to the next provider.
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

const PROVIDERS: Provider[] = [
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

export class AllProvidersFailed extends Error {
  attempts: string[];
  constructor(attempts: string[]) {
    super(`All LLM providers failed: ${attempts.join(" | ")}`);
    this.attempts = attempts;
  }
}

// `parse` validates the raw text (JSON + Zod). If it throws, that provider counts as failed.
export async function callLLM<T>(req: LLMRequest, parse: (text: string) => T): Promise<LLMResult<T>> {
  const attempts: string[] = [];
  for (const p of PROVIDERS) {
    if (!p.model || !p.apiKey) { attempts.push(`${p.name}: not configured`); continue; }
    for (let attempt = 1; attempt <= 2; attempt++) {
      const started = Date.now();
      try {
        const text = await p.call(req, p.model, p.apiKey, AbortSignal.timeout(TIMEOUT_MS));
        return { provider: p.name, model: p.model, data: parse(text), latency_ms: Date.now() - started };
      } catch (e) {
        const status = (e as { status?: number }).status;
        const line = `${p.name}#${attempt}: ${status ?? ""} ${Date.now() - started}ms ${(e as Error).message}`.slice(0, 200);
        console.warn("LLM attempt failed:", line); // logged even when a later provider succeeds
        attempts.push(line);
        if (!(status && status >= 500 && attempt === 1)) break; // only a 5xx earns a retry
      }
    }
  }
  throw new AllProvidersFailed(attempts);
}
