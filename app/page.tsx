import JourneyHero from "@/components/home/JourneyHero";
import FadeIn from "@/components/shared/FadeIn";
import GroupCard from "@/components/home/GroupCard";
import Logo from "@/components/shared/Logo";
import Link from "next/link";
import { STAGES } from "@/lib/topics";

export default function Home() {
  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <header className="px-6 lg:px-12 py-3 flex items-center justify-between gap-4">
        <Logo />
      </header>

      <div className="relative border-b border-neutral-800 pb-12 overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <video
            className="hidden motion-safe:block absolute inset-0 w-full h-full object-cover opacity-[0.12]"
            src="/video/network-bg.mp4"
            autoPlay
            muted
            loop
            playsInline
            aria-hidden="true"
          />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,_rgba(99,102,241,0.16),_transparent_60%)]" />
          <div className="hero-blob-a absolute -top-32 -left-20 w-100 h-100 rounded-full bg-indigo-600/15 blur-3xl" />
          <div className="hero-blob-b absolute top-10 -right-24 w-110 h-110 rounded-full bg-violet-600/10 blur-3xl" />
          <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_0%,#0a0a0a_100%)]" />
        </div>
        <div className="max-w-300 mx-auto px-6 lg:px-12 flex flex-col lg:flex-row items-center gap-10 lg:gap-14">
          <FadeIn from="left" delay="delay-0" className="w-full lg:w-[42%] shrink-0">
            <div className="text-center lg:text-left space-y-5">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-medium">
                Interactive Network Visualizer
              </div>
              <div className="space-y-1">
                <p className="text-neutral-500 text-sm font-mono">Tracing a real request to:</p>
                <p className="text-3xl lg:text-4xl font-bold tracking-tight text-indigo-300 font-mono">google.com</p>
              </div>
              <h1 className="text-2xl lg:text-3xl font-bold tracking-tight leading-tight">
                Watch everything that happens.
              </h1>
              <p className="text-neutral-400 text-sm leading-relaxed max-w-md mx-auto lg:mx-0">
                Every visualizer on this site is one piece of that single journey — from the wire, up
                through switches and routers, to the application on the other end, and back.
              </p>
            </div>
          </FadeIn>

          <FadeIn from="right" delay="delay-300" className="w-full max-w-md mx-auto lg:flex-1 lg:max-w-130 lg:mx-0">
            <JourneyHero />
          </FadeIn>
        </div>
      </div>

      <section className="bg-neutral-950">
        <div className="max-w-300 mx-auto px-6 lg:px-12 py-12">
          <FadeIn className="mb-6">
            <div className="flex items-baseline gap-3 flex-wrap">
              <h2 className="text-lg font-bold text-white">Explore</h2>
              <div className="flex-1 h-px bg-neutral-800" />
            </div>
            <p className="text-xs text-neutral-500 mt-2 max-w-2xl">
              Six areas, one phase of the journey each. Click into any of them for the full list of topics inside.
            </p>
          </FadeIn>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {STAGES.map((stage) => (
              <FadeIn key={stage.slug} className="h-full">
                <GroupCard
                  href={`/learn/${stage.slug}`}
                  preview={stage.groupPreview}
                  title={stage.title}
                  phase={stage.phase}
                  blurb={stage.blurb}
                />
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      <footer className="relative border-t border-neutral-800 bg-[#0d0d10] overflow-hidden">
        <video
          className="hidden motion-safe:block absolute inset-0 w-full h-full object-cover opacity-25"
          src="/video/network-bg.mp4"
          autoPlay
          muted
          loop
          playsInline
          aria-hidden="true"
        />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,#0d0d10_0%,rgba(13,13,16,0.75)_35%,#0d0d10_100%)]" />

        <div className="relative max-w-300 mx-auto px-6 lg:px-12 py-10 grid grid-cols-1 sm:grid-cols-3 gap-8 text-center sm:text-left">
          <div className="flex flex-col items-center sm:items-start gap-2">
            <Logo size={20} />
            <p className="text-xs text-neutral-500 max-w-xs leading-relaxed">
              Every diagram here is interactive, not decorative — the same packet, followed end to end.
            </p>
            <Link href="/learning-path" className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors mt-1">
              Learning Path &rarr;
            </Link>
          </div>

          <div>
            <h3 className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider mb-3">Fundamentals</h3>
            <nav className="flex flex-col items-center sm:items-start gap-2">
              {STAGES.slice(0, 4).map((stage) => (
                <Link key={stage.slug} href={`/learn/${stage.slug}`} className="text-xs text-neutral-400 hover:text-white transition-colors">
                  {stage.title}
                </Link>
              ))}
            </nav>
          </div>

          <div>
            <h3 className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider mb-3">Beyond the Basics</h3>
            <nav className="flex flex-col items-center sm:items-start gap-2">
              {STAGES.slice(4).map((stage) => (
                <Link key={stage.slug} href={`/learn/${stage.slug}`} className="text-xs text-neutral-400 hover:text-white transition-colors">
                  {stage.title}
                </Link>
              ))}
            </nav>
          </div>
        </div>
        <div className="relative border-t border-neutral-900 px-6 lg:px-12 py-4 text-center">
          <p className="text-[11px] text-neutral-600">Network Visualizer &middot; a self-contained learning project, not affiliated with any vendor or certification body.</p>
        </div>
      </footer>
    </div>
  );
}
