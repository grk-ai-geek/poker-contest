type Tone = "success" | "info" | "accent" | "danger" | "neutral";

const tones: Record<Tone, string> = {
  success: "bg-success-bg text-success-fg",
  info: "bg-info-bg text-info-fg",
  accent: "bg-accent-soft text-accent",
  danger: "bg-danger-bg text-danger-fg",
  neutral: "bg-line-soft text-ink-2",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded px-2 py-1 text-xs font-bold tracking-wide ${tones[tone]}`}>
      {children}
    </span>
  );
}
