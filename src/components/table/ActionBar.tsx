"use client";

import { useEffect, useRef, useState } from "react";
import { chips } from "@/lib/client/format";
import type { ActionInput, LegalActions } from "@/lib/poker/types";
import type { TableView } from "@/lib/poker/view";
import type { PreAction } from "@/lib/protocol/messages";

const btn =
  "inline-flex min-h-12 items-center justify-center rounded-full px-5 font-[family-name:var(--font-heading-face)] text-[16px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-13 sm:px-7 sm:text-[17px]";

/** Raise-to amount for a fraction of the pot (pot after calling), clamped to the legal range. */
export function potSized(fraction: number, hand: TableView, legal: LegalActions): number {
  const { minTo, maxTo } = legal.raise!;
  const raw = hand.currentBet === 0 ? fraction * hand.totalPot : hand.currentBet + fraction * (hand.totalPot + legal.toCall);
  return Math.min(maxTo, Math.max(minTo, Math.round(raw)));
}

/** Fold / check / call / bet / raise for the player whose turn it is. Keys: F, C, R. */
export function YourTurn({ hand, legal, onAct }: { hand: TableView; legal: LegalActions; onAct: (a: ActionInput) => void }) {
  const raise = legal.raise;
  const [amount, setAmount] = useState(raise?.minTo ?? 0);
  const [sent, setSent] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);

  const act = (a: ActionInput) => {
    if (sent) return;
    setSent(true); // the server's next view replaces this component
    onAct(a);
  };
  const callOrCheck = () => act(legal.check ? { type: "check" } : { type: "call" });
  const submitRaise = () => {
    if (!raise) return;
    const to = Math.min(raise.maxTo, Math.max(raise.minTo, Math.round(amount)));
    act(to === raise.maxTo ? { type: "allin" } : { type: raise.kind, toAmount: to });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "f") act({ type: "fold" });
      else if (k === "c") callOrCheck();
      else if (k === "r" && raise) {
        e.preventDefault();
        amountRef.current?.focus();
        amountRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const allInAmount = raise && amount >= raise.maxTo;
  const raiseLabel = allInAmount ? `All-in ${chips(raise!.maxTo)}` : `${raise?.kind === "bet" ? "Bet" : "Raise to"} ${chips(amount)}`;

  return (
    <div className="flex flex-col gap-3" aria-label="Your turn">
      {raise ? (
        <div className="flex flex-wrap items-center gap-2">
          {[
            ["½ pot", 0.5],
            ["¾ pot", 0.75],
            ["Pot", 1],
          ].map(([label, f]) => (
            <button key={label} type="button" onClick={() => setAmount(potSized(f as number, hand, legal))} className="min-h-10 rounded-full border border-line px-3 text-[14px] hover:bg-surface-2">
              {label}
            </button>
          ))}
          <button type="button" onClick={() => setAmount(raise.maxTo)} className="min-h-10 rounded-full border border-line px-3 text-[14px] hover:bg-surface-2">
            All-in
          </button>
          <input
            type="range"
            aria-label="Raise amount"
            min={raise.minTo}
            max={raise.maxTo}
            step={Math.max(1, Math.round(hand.level.bb / 2))}
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            className="min-w-32 flex-1 accent-[var(--accent-strong)]"
          />
          <input
            ref={amountRef}
            type="number"
            aria-label="Raise to"
            inputMode="numeric"
            min={raise.minTo}
            max={raise.maxTo}
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            onKeyDown={(e) => e.key === "Enter" && submitRaise()}
            className="min-h-10 w-28 rounded-md border border-field bg-surface px-2 font-mono"
          />
        </div>
      ) : null}
      <div className="grid grid-cols-3 gap-2">
        <button type="button" disabled={sent} onClick={() => act({ type: "fold" })} className={`${btn} border border-ink-2 text-ink hover:bg-surface-2`}>
          Fold
        </button>
        <button type="button" disabled={sent} onClick={callOrCheck} className={`${btn} bg-surface-2 text-ink hover:brightness-125`}>
          {legal.check ? "Check" : `Call ${chips(legal.call!)}`}
        </button>
        {raise ? (
          <button type="button" disabled={sent || amount < raise.minTo || amount > raise.maxTo} onClick={submitRaise} className={`${btn} bg-accent-strong text-on-accent hover:brightness-110`}>
            {raiseLabel}
          </button>
        ) : (
          <span />
        )}
      </div>
    </div>
  );
}

/** Choose an action before your turn comes. */
export function PreActions({ value, onChange }: { value: PreAction | null; onChange: (v: PreAction | null) => void }) {
  const options: [PreAction, string][] = [
    ["check_fold", "Check / Fold"],
    ["call_any", "Call any"],
  ];
  return (
    <fieldset className="flex flex-wrap gap-3">
      <legend className="sr-only">Act in advance</legend>
      {options.map(([v, label]) => (
        <label key={v} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-line px-4 text-[15px] has-[:checked]:border-accent has-[:checked]:text-accent">
          <input type="checkbox" checked={value === v} onChange={(e) => onChange(e.target.checked ? v : null)} className="h-4 w-4 accent-[var(--accent-strong)]" />
          {label}
        </label>
      ))}
    </fieldset>
  );
}
