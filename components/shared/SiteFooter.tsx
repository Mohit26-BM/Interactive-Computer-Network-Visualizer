import Link from "next/link";
import Logo from "@/components/shared/Logo";
import { STAGES } from "@/lib/topics";
import { HERO_PHOTOS } from "@/lib/hero-photos";

// The footer for the browsing pages (home, learn, learning path, OSI, IPv6, devices).
// The simulator pages use a fixed full-height shell and have no footer, so the canvas keeps every pixel.
export default function SiteFooter() {
  return (
    <footer className="relative border-t border-neutral-800 bg-[#0b1017] overflow-hidden mt-auto">

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
          <nav className="flex flex-col items-center sm:items-start gap-2" aria-label="Fundamentals">
            {STAGES.slice(0, 4).map((stage) => (
              <Link key={stage.slug} href={`/learn/${stage.slug}`} className="text-xs text-neutral-400 hover:text-white transition-colors">
                {stage.title}
              </Link>
            ))}
          </nav>
        </div>

        <div>
          <h3 className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider mb-3">Beyond the Basics</h3>
          <nav className="flex flex-col items-center sm:items-start gap-2" aria-label="Beyond the basics">
            {STAGES.slice(4).map((stage) => (
              <Link key={stage.slug} href={`/learn/${stage.slug}`} className="text-xs text-neutral-400 hover:text-white transition-colors">
                {stage.title}
              </Link>
            ))}
          </nav>
        </div>
      </div>

      <div className="relative border-t border-neutral-900 px-6 lg:px-12 py-4 text-center space-y-1">
        <p className="text-[11px] text-neutral-500">
          Home page photos from{" "}
          <a href="https://www.pexels.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-white">Pexels</a>:{" "}
          {[...new Map(HERO_PHOTOS.map((p) => [p.photographer, p])).values()].map((p, i, all) => (
            <span key={p.photographer}>
              <a href={p.page} target="_blank" rel="noopener noreferrer" className="hover:text-white">{p.photographer}</a>
              {i < all.length - 1 ? ", " : ""}
            </span>
          ))}
        </p>
        <p className="text-[11px] text-neutral-600">Network Visualizer &middot; a self-contained learning project, not affiliated with any vendor or certification body.</p>
      </div>
    </footer>
  );
}
