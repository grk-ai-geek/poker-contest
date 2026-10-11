import { chips } from "@/lib/client/format";

// Chip stacks for bets and pots. Colours follow common casino denominations.
const DENOMINATIONS: [value: number, colour: string][] = [
  [25_000, "#ad1457"],
  [5_000, "#e65100"],
  [1_000, "#f9a825"],
  [500, "#6a1b9a"],
  [100, "#1f1f1f"],
  [25, "#2e7d32"],
  [5, "#c62828"],
  [1, "#e8e8e8"],
];

const MAX_CHIPS = 7;

/** Biggest chips first, at most MAX_CHIPS of them (enough to look like the amount). */
function chipColours(amount: number): string[] {
  const out: string[] = [];
  let left = amount;
  for (const [value, colour] of DENOMINATIONS) {
    while (left >= value && out.length < MAX_CHIPS) {
      out.push(colour);
      left -= value;
    }
  }
  return out;
}

export function ChipStack({ amount, label = true, className = "" }: { amount: number; label?: boolean; className?: string }) {
  const stack = chipColours(amount);
  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <span aria-hidden="true" className="relative h-[18px] w-[18px] sm:h-[22px] sm:w-[22px]" style={{ marginTop: (stack.length - 1) * 3 }}>
        {stack.map((colour, i) => (
          <span key={i} className="chip absolute inset-0" style={{ "--chip": colour, transform: `translateY(${-i * 3}px)` } as React.CSSProperties} />
        ))}
      </span>
      {label ? <span className="rounded-full bg-black/60 px-1.5 py-px font-mono text-[12px] font-semibold text-white sm:text-[13px]">{chips(amount)}</span> : null}
    </div>
  );
}
