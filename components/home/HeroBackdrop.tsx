"use client";
import { useCallback, useEffect, useState } from "react";
import { HERO_PHOTOS } from "@/lib/hero-photos";

const INTERVAL_MS = 6500;

// A carousel of network-hardware photographs (amber duotone) behind the home hero.
// - the first photo loads straight away; the rest are added a moment later so they never delay the page
// - it advances on its own, stops while the tab is hidden, and the dots let you pick a photo yourself
// - with reduced motion switched on it shows one still photo and no dots
// - state starts at photo 0, so the first client render matches the server markup (no hydration mismatch)
export default function HeroBackdrop() {
  const [active, setActive] = useState(0);
  const [more, setMore] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [tick, setTick] = useState(0); // bumped when you pick a photo, so the auto-advance timer starts over

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (reduced) return undefined;
    const warm = setTimeout(() => setMore(true), 1200);
    return () => clearTimeout(warm);
  }, [reduced]);

  useEffect(() => {
    if (reduced || !more) return undefined;
    const id = setInterval(() => {
      if (!document.hidden) setActive((i) => (i + 1) % HERO_PHOTOS.length);
    }, INTERVAL_MS);
    return () => clearInterval(id);
  }, [reduced, more, tick]);

  const pick = useCallback((i: number) => {
    setActive(i);
    setTick((t) => t + 1);
  }, []);

  const photos = more && !reduced ? HERO_PHOTOS : HERO_PHOTOS.slice(0, 1);
  const shown = reduced ? 0 : active;

  return (
    <>
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
        {photos.map((p, i) => (
          // eslint-disable-next-line @next/next/no-img-element -- local, pre-sized WebP; next/image adds nothing here
          <img
            key={p.name}
            src={`/images/hero-${p.name}.webp`}
            srcSet={`/images/hero-${p.name}-sm.webp 800w, /images/hero-${p.name}.webp ${p.w}w`}
            sizes="100vw"
            alt=""
            width={p.w}
            height={p.h}
            decoding="async"
            fetchPriority={i === 0 ? "high" : "low"}
            className={`absolute inset-0 w-full h-full object-cover object-center transition-opacity duration-[1400ms] ease-out ${i === shown ? "opacity-80" : "opacity-0"}`}
          />
        ))}
        {/* keep the text readable on the left, and blend the bottom edge into the page */}
        <div className="absolute inset-0 bg-linear-to-r from-[#080b10]/95 via-[#080b10]/60 to-[#080b10]/10" />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_55%,#080b10_100%)]" />
      </div>

      {!reduced && more && (
        <div className="absolute bottom-3 right-4 lg:right-12 flex items-center gap-2" role="group" aria-label="Hero photo">
          {HERO_PHOTOS.map((p, i) => (
            <button
              key={p.name}
              type="button"
              onClick={() => pick(i)}
              aria-label={`Show photo ${i + 1} of ${HERO_PHOTOS.length}`}
              aria-current={i === shown}
              className={`h-2 rounded-full transition-all duration-300 ${i === shown ? "w-6 bg-indigo-400" : "w-2 bg-neutral-600 hover:bg-neutral-400"}`}
            />
          ))}
        </div>
      )}
    </>
  );
}
