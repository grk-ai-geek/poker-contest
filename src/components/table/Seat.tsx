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
  /** Holds the dealer button this hand. */
  dealer: boolean;
  turn: { deadline: number; timeBank: boolean } | null;
  now: number;
  x: number;
  y: number;
};

/** A ring around the avatar that empties as the clock runs down. */
function TimerRing({ deadline, timeBank, now }: { deadline: number; timeBank: boolean; now: number }) {
  // The full length is whatever was left when this deadline first appeared.
  const [start, setStart] = useState({ deadline, total: Math.max(1, deadline - now) });
  if (start.deadline !== deadline) setStart({ deadline, total: Math.max(1, deadline - now) });
  const left = Math.max(0, deadline - now);
  const fraction = Math.min(1, left / start.total);
  const urgent = left < 5000;
  const r = 47;
  const length = 2 * Math.PI * r;
  return (
    <>
      <svg viewBox="0 0 100 100" aria-hidden="true" className="pointer-events-none absolute -inset-[5px] -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(0,0,0,0.55)" strokeWidth="6" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          className={`transition-[stroke-dashoffset] duration-200 ease-linear ${timeBank ? "stroke-info-fg" : urgent ? "stroke-danger" : "stroke-accent"}`}
          strokeDasharray={length}
          strokeDashoffset={length * (1 - fraction)}
        />
      </svg>
      <span role="timer" className="absolute -right-2 -top-1 z-30 rounded-full bg-black/80 px-1.5 font-mono text-[11px] font-semibold text-white">
        {Math.ceil(left / 1000)}
        <span className="sr-only"> seconds left{timeBank ? " (time bank)" : ""}</span>
      </span>
    </>
  );
}

export function Seat({ seatNo, player, inHand, handRunning, isYou, highlight, won, dealer, turn, now, x, y }: SeatProps) {
  const style = { left: `${x}%`, top: `${y}%` };

  if (!player) {
    return (
      <div style={style} className="absolute -translate-x-1/2 -translate-y-1/2" aria-label={`Seat ${seatNo}, empty`}>
        <div className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-dashed border-white/25 bg-black/25 text-[12px] font-semibold text-white/50 sm:h-14 sm:w-14">
          {seatNo}
        </div>
      </div>
    );
  }

  const folded = inHand?.status === "folded";
  const allIn = inHand?.status === "allin";
  const waiting = handRunning && !inHand; // seated mid-hand: plays from the next one
  const status = folded ? "Folded" : allIn ? "All-in" : player.sittingOut ? "Sitting out" : waiting ? "Next hand" : null;
  const cards = inHand && !folded ? inHand.cards ?? null : null;
  const showBacks = inHand && !folded && !inHand.cards;

  return (
    <div
      style={style}
      className="absolute flex w-[88px] -translate-x-1/2 -translate-y-1/2 flex-col items-center sm:w-[124px]"
      aria-label={`Seat ${seatNo}: ${player.name}${isYou ? " (you)" : ""}, ${chips(player.stack)} chips${status ? `, ${status}` : ""}`}
    >
      {/* Hole cards fan out from behind the avatar. */}
      <div className="relative z-0 -mb-2 flex h-[42px] sm:-mb-3 sm:h-[54px]">
        {cards
          ? cards.map((c, i) => (
              <PlayingCard key={c} card={c} size="sm" highlight={highlight.has(c)} className={i ? "-ml-2.5" : ""} style={{ transform: `rotate(${i ? 7 : -7}deg)` }} />
            ))
          : showBacks
            ? [0, 1].map((i) => <CardBack key={i} size="sm" className={i ? "-ml-4 sm:-ml-5" : ""} style={{ transform: `rotate(${i ? 8 : -8}deg)` }} />)
            : null}
      </div>
      <div className={`relative z-10 rounded-full ${folded ? "opacity-55 grayscale" : ""}`}>
        <div className={`rounded-full p-[3px] shadow-[0_4px_10px_rgba(0,0,0,0.6)] ${won > 0 ? "bg-accent" : isYou ? "bg-accent/70" : "bg-black/70"}`}>
          <span className="block sm:hidden"><Avatar name={player.name} src={player.avatarUrl} size={40} /></span>
          <span className="hidden sm:block"><Avatar name={player.name} src={player.avatarUrl} size={56} /></span>
        </div>
        {turn ? <TimerRing deadline={turn.deadline} timeBank={turn.timeBank} now={now} /> : null}
        {dealer ? (
          // On the side of the avatar that faces the middle of the table.
          <span
            aria-label="Dealer button"
            className={`dealer-button absolute top-1/2 z-30 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-black text-black sm:h-6 sm:w-6 sm:text-[12px] ${x > 50 ? "-left-6 sm:-left-7" : "-right-6 sm:-right-7"}`}
          >
            D
          </span>
        ) : null}
      </div>
      <div
        className={`relative z-20 -mt-2 w-full rounded-lg border px-1.5 py-0.5 text-center leading-tight shadow-[0_3px_8px_rgba(0,0,0,0.55)] sm:py-1 ${
          turn ? "border-accent bg-black/85" : "border-white/15 bg-black/75"
        } ${folded ? "opacity-70" : ""}`}
      >
        <div className="truncate text-[12px] font-semibold text-white sm:text-[14px]">
          {player.name}
          {isYou ? <span className="text-accent-strong"> (you)</span> : null}
        </div>
        <div className="font-mono text-[12px] font-semibold text-accent-strong sm:text-[13px]">{chips(player.stack)}</div>
      </div>
      {turn?.timeBank ? <div className="mt-1 rounded bg-info-bg px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-info-fg">Time bank</div> : null}
      {status && !turn ? <div className="mt-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">{status}</div> : null}
      {won > 0 ? <div className="mt-1 rounded bg-accent-strong px-1.5 py-0.5 font-mono text-[11px] font-bold text-on-accent">+{chips(won)}</div> : null}
    </div>
  );
}
