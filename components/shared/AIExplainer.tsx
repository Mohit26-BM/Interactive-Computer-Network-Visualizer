"use client";
import { useEffect, useRef, useState } from "react";

interface Props {
  algorithm: string;
  stepExplanation: string;
  stepIndex: number;
  totalSteps: number;
  additionalContext?: string;
}

export default function AIExplainer({
  algorithm,
  stepExplanation,
  stepIndex,
  totalSteps,
  additionalContext,
}: Props) {
  const [aiText, setAiText] = useState("");
  const [loading, setLoading] = useState(false);
  const [streamDone, setStreamDone] = useState(false);
  const [open, setOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Clear whenever the step changes (adjusting state during render, not in an effect)
  const [seenStep, setSeenStep] = useState(stepIndex);
  if (seenStep !== stepIndex) {
    setSeenStep(stepIndex);
    setAiText("");
    setOpen(false);
    setLoading(false);
    setStreamDone(false);
  }

  // Cancel any in-flight request when the step changes or the component unmounts
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, [stepIndex]);

  const handleExplain = async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setOpen(true);
    setLoading(true);
    setAiText("");
    setStreamDone(false);

    try {
      const res = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ algorithm, stepExplanation, stepIndex, totalSteps, additionalContext }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const detail = res.status === 429 ? "Too many requests - please wait a minute and try again." :
          res.status === 503 ? "The AI tutor is not configured on this server." :
          "The AI tutor is unavailable right now. Try again in a moment.";
        setAiText(detail);
        setLoading(false);
        setStreamDone(true);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      setLoading(false);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        setAiText((prev) => prev + decoder.decode(value, { stream: true }));
      }
      setStreamDone(true);
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setAiText("Something went wrong. Try again.");
        setLoading(false);
        setStreamDone(true);
      }
    }
  };

  const handleClose = () => {
    setOpen(false);
    setAiText("");
    setStreamDone(false);
    abortRef.current?.abort();
  };

  if (!stepExplanation) return null;

  return (
    <div>
      {!open ? (
        <button
          type="button"
          onClick={handleExplain}
          className="flex items-center gap-1.5 text-xs text-indigo-400/70 hover:text-indigo-300 transition-colors duration-200 font-medium py-0.5 group"
        >
          <svg className="w-3 h-3 group-hover:scale-110 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M12 3v3m0 12v3m9-9h-3M6 12H3m14.24-6.24-2.12 2.12M8.88 15.12l-2.12 2.12m0-10.48 2.12 2.12m8.24 8.24 2.12 2.12" />
            <circle cx="12" cy="12" r="4" strokeWidth={1.6} />
          </svg>
          <span>Explain in detail</span>
        </button>
      ) : (
        <div className="bg-indigo-950/50 border border-indigo-500/20 rounded-lg px-4 py-3 relative">
          <button
            type="button"
            onClick={handleClose}
            className="absolute top-2.5 right-3 text-indigo-400/40 hover:text-indigo-400 transition-colors text-xs leading-none"
            aria-label="Close explanation"
          >
            &#10005;
          </button>

          <div className="flex items-center gap-1.5 mb-2">
            <svg className="w-3 h-3 text-indigo-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M12 3v3m0 12v3m9-9h-3M6 12H3m14.24-6.24-2.12 2.12M8.88 15.12l-2.12 2.12m0-10.48 2.12 2.12m8.24 8.24 2.12 2.12" />
              <circle cx="12" cy="12" r="4" strokeWidth={1.6} />
            </svg>
            <span className="text-[10px] text-indigo-400 font-semibold uppercase tracking-wider">AI Tutor</span>
          </div>

          {loading ? (
            <p className="text-sm text-indigo-300/50 animate-pulse">Thinking&hellip;</p>
          ) : (
            <p className="text-sm text-indigo-100/90 leading-relaxed pr-5">
              {aiText}
              {!streamDone && (
                <span className="inline-block w-0.5 h-[13px] bg-indigo-400/70 ml-0.5 animate-pulse align-middle" />
              )}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
