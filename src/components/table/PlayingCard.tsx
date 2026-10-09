import { cardLabel, isRed, rankText, suitSymbol } from "@/lib/client/format";
import type { Card } from "@/lib/poker/cards";

type Size = "sm" | "md" | "lg";

const sizes: Record<Size, string> = {
  sm: "h-[42px] w-[30px] text-[13px] sm:h-[52px] sm:w-[37px] sm:text-[15px]",
  md: "h-[56px] w-[40px] text-[16px] sm:h-[74px] sm:w-[53px] sm:text-[20px]",
  lg: "h-[64px] w-[46px] text-[18px] sm:h-[84px] sm:w-[60px] sm:text-[23px]",
};

/** A face-up card: drawn with CSS, labelled for screen readers ("Ace of hearts"). */
export function PlayingCard({ card, size = "md", highlight = false, dim = false }: { card: Card; size?: Size; highlight?: boolean; dim?: boolean }) {
  return (
    <span
      role="img"
      aria-label={cardLabel(card)}
      className={`card-in relative flex flex-col items-center justify-center rounded-md border bg-card-face font-semibold leading-none shadow-sm ${sizes[size]} ${
        isRed(card) ? "text-card-red" : "text-card-black"
      } ${highlight ? "border-accent ring-2 ring-accent" : "border-black/20"} ${dim ? "opacity-45" : ""}`}
    >
      <span aria-hidden="true">{rankText(card)}</span>
      <span aria-hidden="true" className="text-[1.15em]">{suitSymbol(card)}</span>
    </span>
  );
}

/** A face-down card. */
export function CardBack({ size = "md" }: { size?: Size }) {
  return (
    <span
      aria-hidden="true"
      className={`rounded-md border border-white/40 shadow-sm ${sizes[size]}`}
      style={{ background: "repeating-linear-gradient(45deg, var(--card-back-a) 0 4px, var(--card-back-b) 4px 8px)" }}
    />
  );
}

/** An empty board slot. */
export function CardSlot({ size = "md" }: { size?: Size }) {
  return <span aria-hidden="true" className={`rounded-md border border-dashed border-white/25 ${sizes[size]}`} />;
}
