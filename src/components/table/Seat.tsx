"use client";

import { useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { chips } from "@/lib/client/format";
import type { SeatView } from "@/lib/poker/view";
import type { TablePlayerView } from "@/lib/protocol/messages";
import { CardBack, PlayingCard } from "./PlayingCard";

export type SeatProps = {
  seatNo: number;
  player: TablePlayerView | undefined;
  inHand: SeatView | undefined;
  handRunning: boolean;
  isYou: boolean;
  /** Cards to highlight (the winning five at showdown). */
  highlight: Set<string>;
  won: number;
  turn: { deadline: number; timeBank: boolean } | null;
  now: number;
  x: number;
  y: number;
};

/** Seconds left on the clock, with a bar that empties. */
function TurnTimer({ deadline, timeBank, now }: { deadline: number; timeBank: boolean; now: number }) {
  // The full length is whatever was left when this deadline first appeared.
  const [start, setStart] = useState({ deadline, total: Math.max(1, deadline - now) });
  if (start.deadline !== deadline) setStart({ deadline, total: Math.max(1, deadline - now) });
  const left = Math.max(0, deadline - now);
  const fraction = Math.min(1, left / start.total);
  const urgent = left < 5000;
  return (
    <div className="mt-1 w-full" role="timer" aria-label={`${Math.ceil(left / 1000)} seconds left${timeBank ? " (time bank)" : ""}`}>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/40">
        <div
          className={`h-full rounded-full transition-[width] duration-200 ease-linear ${timeBank ? "bg-info-fg" : urgent ? "bg-danger" : "bg-accent"}`}
          style={{ width: `${fraction * 100}%` }}
        />
      </div>
      {timeBank ? <div className="mt-0.5 text-center text-[10px] font-semibold uppercase tracking-wide text-info-fg">Time bank</div> : null}
    </div>
  );
}

export function Seat({ seatNo, player, inHand, handRunning, isYou, highlight, won, turn, now, x, y }: SeatProps) {
  const style = { left: `${x}%`, top: `${y}%` };

  if (!player) {
    return (
      <div style={style} className="absolute -translate-x-1/2 -translate-y-1/2" aria-label={`Seat ${seatNo}, empty`}>
        <div className="flex h-11 w-11 items-center justify-center rounded-full border border-dashed border-white/30 text-[11px] text-white/50 sm:h-14 sm:w-14">
          {seatNo}
        </div>
      </div>
    );
  }

  const folded = inHand?.status === "folded";
  const allIn = inHand?.status === "allin";
  const waiting = handRunning && !inHand; // seated mid-hand: plays from the next one
  const status = folded ? "Folded" : allIn ? "All-in" : player.sittingOut ? "Sitting out" : waiting ? "Next hand" : null;

  return (
    <div
      style={style}
      className={`absolute flex w-[92px] -translate-x-1/2 -translate-y-1/2 flex-col items-center sm:w-[128px] ${folded ? "opacity-60" : ""}`}
      aria-label={`Seat ${seatNo}: ${player.name}${isYou ? " (you)" : ""}, ${chips(player.stack)} chips${status ? `, ${status}` : ""}`}
    >
      {/* Cards sit just above the name plate. */}
      <div className="relative z-0 -mb-3 flex h-[42px] gap-0.5 sm:h-[52px]">
        {inHand && !folded
          ? inHand.cards
            ? inHand.cards.map((c) => <PlayingCard key={c} card={c} size="sm" highlight={highlight.has(c)} />)
            : [0, 1].map((i) => <CardBack key={i} size="sm" />)
          : null}
      </div>
      <div
        className={`relative z-10 flex w-full items-center gap-1.5 rounded-xl border px-1.5 py-1 shadow-md sm:gap-2 sm:px-2 sm:py-1.5 ${
          turn ? "border-accent bg-surface ring-2 ring-accent" : isYou ? "border-accent/60 bg-surface" : "border-line bg-surface"
        }`}
      >
        <span className="hidden sm:block">
          <Avatar name={player.name} size={32} />
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-[12px] font-semibold sm:text-[14px]">
            {player.name}
            {isYou ? <span className="text-accent"> (you)</span> : null}
          </div>
          <div className="font-mono text-[12px] text-ink-2 sm:text-[13px]">{chips(player.stack)}</div>
        </div>
      </div>
      {turn ? <TurnTimer deadline={turn.deadline} timeBank={turn.timeBank} now={now} /> : null}
      {status && !turn ? <div className="mt-1 rounded bg-black/50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">{status}</div> : null}
      {won > 0 ? <div className="mt-1 rounded bg-accent-strong px-1.5 py-0.5 font-mono text-[11px] font-bold text-on-accent">+{chips(won)}</div> : null}
    </div>
  );
}
