import { cardLabel, isRed, rankText, suitSymbol } from "@/lib/client/format";
import type { Card } from "@/lib/poker/cards";

type Size = "sm" | "md" | "lg";

const sizes: Record<Size, string> = {
  sm: "h-[42px] w-[30px] text-[14px] sm:h-[54px] sm:w-[39px] sm:text-[17px]",
  md: "h-[56px] w-[40px] text-[17px] sm:h-[78px] sm:w-[56px] sm:text-[23px]",
  lg: "h-[64px] w-[46px] text-[19px] sm:h-[88px] sm:w-[63px] sm:text-[26px]",
};

/** A face-up card: rank in the corner, a large suit below. Labelled for screen readers ("Ace of hearts"). */
export function PlayingCard({ card, size = "md", highlight = false, dim = false, className = "", style }: { card: Card; size?: Size; highlight?: boolean; dim?: boolean; className?: string; style?: React.CSSProperties }) {
  return (
    <span
      role="img"
      aria-label={cardLabel(card)}
      style={style}
      className={`card-in card-face relative block overflow-hidden rounded-[0.3em] font-bold leading-none ${sizes[size]} ${
        isRed(card) ? "text-card-red" : "text-card-black"
      } ${highlight ? "ring-2 ring-accent ring-offset-1 ring-offset-black/40" : ""} ${dim ? "opacity-45" : ""} ${className}`}
    >
      <span aria-hidden="true" className="absolute left-[10%] top-[7%] flex flex-col items-center gap-[0.05em] tracking-[-0.06em]">
        <span>{rankText(card)}</span>
        <span className="text-[0.7em]">{suitSymbol(card)}</span>
      </span>
      <span aria-hidden="true" className="absolute bottom-[4%] right-[8%] text-[1.45em]">{suitSymbol(card)}</span>
    </span>
  );
}

/** A face-down card. */
export function CardBack({ size = "md", className = "", style }: { size?: Size; className?: string; style?: React.CSSProperties }) {
  return <span aria-hidden="true" style={style} className={`card-back block rounded-[0.3em] ${sizes[size]} ${className}`} />;
}

/** An empty board slot. */
export function CardSlot({ size = "md" }: { size?: Size }) {
  return <span aria-hidden="true" className={`block rounded-[0.3em] border border-white/15 bg-black/10 ${sizes[size]}`} />;
}
