"use client";

import { useState, useRef, useCallback, useEffect } from "react";

export function usePlayer(totalSteps: number) {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A new simulation (different number of steps) starts again from step 0, paused.
  // Adjusting state while rendering is React's recommended alternative to an effect here.
  const [seenTotal, setSeenTotal] = useState(totalSteps);
  if (seenTotal !== totalSteps) {
    setSeenTotal(totalSteps);
    setStep(0);
    setPlaying(false);
  }

  // Playback ends by itself on the last step.
  const isPlaying = playing && step < totalSteps - 1;

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const pause = useCallback(() => {
    setPlaying(false);
    clearTimer();
  }, [clearTimer]);

  const play = useCallback(() => {
    if (step >= totalSteps - 1) setStep(0);
    setPlaying(true);
  }, [step, totalSteps]);

  const stepForward = useCallback(() => {
    pause();
    setStep((s) => Math.min(s + 1, totalSteps - 1));
  }, [pause, totalSteps]);

  const stepBackward = useCallback(() => {
    pause();
    setStep((s) => Math.max(s - 1, 0));
  }, [pause]);

  const reset = useCallback(() => {
    pause();
    setStep(0);
  }, [pause]);

  const seek = useCallback((n: number) => {
    pause();
    setStep(Math.max(0, Math.min(Math.floor(n), totalSteps - 1)));
  }, [pause, totalSteps]);

  useEffect(() => {
    if (!isPlaying) return;
    timerRef.current = setTimeout(() => {
      setStep((s) => s + 1);
    }, 1000 / speed);
    return clearTimer;
  }, [isPlaying, step, speed, clearTimer]);

  return { step, playing: isPlaying, speed, play, pause, stepForward, stepBackward, reset, setSpeed, seek };
}
