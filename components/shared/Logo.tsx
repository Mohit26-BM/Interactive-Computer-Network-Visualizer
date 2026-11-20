interface Props {
  className?: string;
  showWordmark?: boolean;
  size?: number;
}

// The brand mark, drawn from the product's own visual vocabulary instead of
// a generic bolt-on logo: three connected nodes, same motif as the topology
// and routing preview diagrams elsewhere on the site.
export default function Logo({ className = "", showWordmark = true, size = 20 }: Props) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="shrink-0">
        <line x1="16" y1="9" x2="9" y2="21" stroke="#44546a" strokeWidth="1.6" />
        <line x1="16" y1="9" x2="23" y2="21" stroke="#44546a" strokeWidth="1.6" />
        <line x1="9" y1="21" x2="23" y2="21" stroke="#2a3547" strokeWidth="1.6" strokeDasharray="2 2" />
        <circle cx="16" cy="9" r="4" fill="#ffb347" />
        <circle cx="9" cy="21" r="3" fill="none" stroke="#8b9cff" strokeWidth="1.6" />
        <circle cx="23" cy="21" r="3" fill="none" stroke="#8b9cff" strokeWidth="1.6" />
      </svg>
      {showWordmark && (
        <span className="text-xs font-mono text-neutral-300 tracking-wide whitespace-nowrap">Network Visualizer</span>
      )}
    </span>
  );
}
