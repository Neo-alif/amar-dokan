"use client";
// Voice input with the browser's Web Speech API (bn-BD). Chrome/Edge only; text stays an equal option.
// The transcript goes into the editable text box. Nothing is sent until the owner presses পাঠান.

import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/i18n/LanguageContext";
import type { ErrorCode } from "@/i18n/dictionary";

// Minimal types: SpeechRecognition is not in TypeScript's DOM lib.
type Recognition = {
  lang: string; interimResults: boolean; continuous: boolean; maxAlternatives: number;
  start(): void; stop(): void; abort(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};
type RecognitionCtor = new () => Recognition;

function errorCode(error: string): ErrorCode {
  if (error === "not-allowed" || error === "service-not-allowed" || error === "audio-capture") return "MIC_DENIED";
  if (error === "no-speech") return "NO_SPEECH";
  if (error === "network") return "NETWORK";
  return "VOICE_FAILED";
}

export function MicButton({ onText, onError, disabled }: {
  onText: (text: string) => void;
  onError: (code: ErrorCode | null) => void;
  disabled?: boolean;
}) {
  const { t } = useLanguage();
  const [listening, setListening] = useState(false);
  const rec = useRef<Recognition | null>(null);

  useEffect(() => () => rec.current?.abort(), []); // stop the mic when leaving the page

  function toggle() {
    if (listening) { rec.current?.stop(); return; }
    const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) { onError("VOICE_UNSUPPORTED"); return; }

    const r = new Ctor();
    r.lang = "bn-BD";
    r.interimResults = true; // show words live while the owner speaks
    r.continuous = false;    // one sentence = one transaction
    r.maxAlternatives = 1;
    r.onresult = (e) => onText(Array.from(e.results, (res) => res[0].transcript).join(" ").trim());
    r.onerror = (e) => { if (e.error !== "aborted") onError(errorCode(e.error)); };
    r.onend = () => setListening(false);
    rec.current = r;
    onError(null);
    try {
      r.start();
      setListening(true);
    } catch {
      onError("VOICE_FAILED");
    }
  }

  return (
    <div className="flex flex-col items-center gap-3.5">
      <button type="button" onClick={toggle} disabled={disabled}
        aria-label={listening ? t.entry.micStop : t.entry.mic} aria-pressed={listening}
        className="relative flex size-28 items-center justify-center rounded-full bg-accent shadow-[0_0_0_14px_#F3EEFF,0_0_0_28px_#FAF7FF] disabled:opacity-50">
        {listening && <span className="absolute inset-0 animate-ping rounded-full bg-accent/40" aria-hidden="true" />}
        <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {listening
            ? <rect x="7" y="7" width="10" height="10" rx="2" />
            : <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0" /><path d="M12 18v3" /></>}
        </svg>
      </button>
      <span className="mt-3.5 text-lg font-semibold text-accent" aria-live="polite">
        {listening ? t.entry.listening : t.entry.micHint}
      </span>
    </div>
  );
}
