import FadeIn from "@/components/shared/FadeIn";
import GroupCard from "@/components/home/GroupCard";
import Logo from "@/components/shared/Logo";
import SiteFooter from "@/components/shared/SiteFooter";
import HeroBackdrop from "@/components/home/HeroBackdrop";
import { STAGES } from "@/lib/topics";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col text-white">
      <header className="px-6 lg:px-12 py-3 flex items-center justify-between gap-4">
        <Logo />
      </header>

      <div className="relative border-b border-neutral-800 pb-12 overflow-hidden">
        <HeroBackdrop />
        <div className="max-w-300 mx-auto px-6 lg:px-12 py-10 lg:py-16 flex flex-col lg:flex-row items-center gap-10 lg:gap-14">
          <div className="w-full lg:w-[46%] shrink-0">
            <div className="text-center lg:text-left space-y-5">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-medium">
                Interactive Network Visualizer
              </div>
              <div className="space-y-1">
                <p className="text-neutral-400 text-sm font-mono">Tracing a real request to:</p>
                <p className="text-3xl lg:text-4xl font-bold tracking-tight text-indigo-300 font-mono">google.com</p>
              </div>
              <h1 className="text-2xl lg:text-3xl font-bold tracking-tight leading-tight">
                Watch everything that happens.
              </h1>
              <p className="text-neutral-300 text-sm leading-relaxed max-w-md mx-auto lg:mx-0">
                Every visualizer on this site is one piece of that single journey — from the wire, up
                through switches and routers, to the application on the other end, and back.
              </p>
            </div>
          </div>
        </div>
      </div>

      <section>
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

      <SiteFooter />
    </div>
  );
}
