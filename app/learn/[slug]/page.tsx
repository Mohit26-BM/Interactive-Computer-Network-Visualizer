import { notFound } from "next/navigation";
import Link from "next/link";
import FadeIn from "@/components/shared/FadeIn";
import TypeCard from "@/components/shared/TypeCard";
import RouteHelp from "@/components/shared/RouteHelp";
import Logo from "@/components/shared/Logo";
import { STAGES, getStageBySlug } from "@/lib/topics";
import SiteFooter from "@/components/shared/SiteFooter";

export function generateStaticParams() {
  return STAGES.map((s) => ({ slug: s.slug }));
}

export default async function StagePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const stage = getStageBySlug(slug);
  if (!stage) notFound();

  const helpSections = [
    { heading: "What this page does", body: `Every topic in ${stage.title} — ${stage.phase} of the site's overall journey.` },
    { heading: "How to use it", body: "Built topics are fully interactive simulators — click through. The rest are shown as what's still coming, not broken links." },
  ];

  return (
    <div className="min-h-screen flex flex-col text-white">
      <header className="border-b border-neutral-800 px-6 py-4 flex items-center gap-4">
        <Link href="/" className="opacity-80 hover:opacity-100 transition-opacity" aria-label="Network Visualizer home" title="Back to home">
          <Logo showWordmark={false} size={22} />
        </Link>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <h1 className="text-xl font-bold truncate">{stage.title}</h1>
          <span className="text-xs bg-neutral-900 border border-neutral-700 text-neutral-400 px-2 py-0.5 rounded-full font-mono hidden sm:inline">
            {stage.phase}
          </span>
        </div>
        <RouteHelp title={stage.title} sections={helpSections} />
      </header>

      <div className="max-w-300 mx-auto px-6 lg:px-12 py-10 space-y-8">
        <FadeIn>
          <p className="text-sm text-neutral-400 leading-relaxed max-w-2xl">{stage.blurb}</p>
        </FadeIn>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {stage.topics.map((topic) => (
            <FadeIn key={topic.href} className="h-full">
              <TypeCard
                href={topic.href}
                preview={topic.preview}
                title={topic.title}
                subtitle={topic.subtitle}
                description={topic.description}
                badges={topic.badges}
                disabled={!topic.built}
              />
            </FadeIn>
          ))}
        </div>

        <div className="pt-4">
          <Link href="/" className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors">
            &larr; Back to all areas
          </Link>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
