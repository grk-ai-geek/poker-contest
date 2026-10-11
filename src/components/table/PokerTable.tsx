"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { chips, eventText } from "@/lib/client/format";
import { useNow, useTable } from "@/lib/client/useTable";
import { brand } from "@/config/brand";
import type { ClientTableView } from "@/lib/protocol/messages";
import { PreActions, YourTurn } from "./ActionBar";
import { ChipStack } from "./Chips";
import { CardSlot, PlayingCard } from "./PlayingCard";
import { Seat } from "./Seat";

/** Seat position around the oval, in % of the table box. The viewer's seat is at the bottom. */
function around(seatNo: number, maxSeats: number, bottomSeat: number, rx: number, ry: number, shiftDeg = 0) {
  const angle = ((90 + ((seatNo - bottomSeat) * 360) / maxSeats + shiftDeg) * Math.PI) / 180;
  return { x: 50 + rx * Math.cos(angle), y: 50 + ry * Math.sin(angle) };
}

function useSoundSetting(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(true);
  useEffect(() => {
    try {
      // Read once on mount: localStorage only exists in the browser.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOn(localStorage.getItem("table-sound") !== "off");
    } catch {}
  }, []);
  const set = (value: boolean) => {
    setOn(value);
    try {
      localStorage.setItem("table-sound", value ? "on" : "off");
    } catch {}
  };
  return [on, set];
}

/** A short two-note chime when it becomes your turn (no audio files needed). */
function chime() {
  try {
    const ctx = new AudioContext();
    [660, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.08, ctx.currentTime + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.12 + 0.25);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.12);
      osc.stop(ctx.currentTime + i * 0.12 + 0.3);
    });
    setTimeout(() => void ctx.close(), 1000);
  } catch {}
}

function StatusPill({ status }: { status: string }) {
  if (status === "open") return null;
  const text = status === "replaced" ? "Opened in another window" : status === "connecting" ? "Connecting…" : "Reconnecting…";
  return (
    <span role="status" className="rounded-full bg-danger-bg px-3 py-1 text-[13px] font-semibold text-danger-fg">
      {text}
    </span>
  );
}

export function PokerTable({ tableId, signedIn }: { tableId: string; signedIn: boolean }) {
  const t = useTable(tableId);
  const view = t.view;
  const [sound, setSound] = useSoundSetting();
  const turnRunning = Boolean(view?.turn);
  const now = useNow(turnRunning) + t.clockOffset;

  // Chime once when it becomes your turn.
  const myTurnKey = view?.hand?.you?.legal ? `${view.hand.handNo}:${view.hand.events.length}` : null;
  const lastChime = useRef<string | null>(null);
  useEffect(() => {
    if (myTurnKey && sound && lastChime.current !== myTurnKey) chime();
    lastChime.current = myTurnKey;
  }, [myTurnKey, sound]);

  // Errors fade after a few seconds.
  const [shownError, setShownError] = useState<string | null>(null);
  useEffect(() => {
    if (!t.lastError) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mirrors an external event into a toast
    setShownError(t.lastError.message);
    const id = setTimeout(() => setShownError(null), 4000);
    return () => clearTimeout(id);
  }, [t.lastError]);

  if (!view) {
    return (
      <div className="flex flex-col items-start gap-3">
        <h1 className="text-[28px] font-medium">Table</h1>
        <p className="text-ink-2">{t.lastError?.code === "not_found" ? "This table doesn't exist or has closed." : "Connecting to the table…"}</p>
        {t.lastError?.code === "not_found" ? <Link href="/contests" className="font-semibold text-accent">Back to tournaments</Link> : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <TableHeader view={view} status={t.status} sound={sound} onSound={setSound} onLeave={view.you ? t.leaveSeat : undefined} />
      {view.notice ? <p role="status" className="rounded-md bg-info-bg px-3 py-2 text-[15px] text-info-fg">{view.notice}</p> : null}
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-4">
          <Felt view={view} now={now} />
          <Controls view={view} signedIn={signedIn} t={t} />
        </div>
        <HandLog view={view} />
      </div>
      {shownError ? (
        <div role="alert" className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md rounded-lg bg-danger-bg px-4 py-3 text-center text-danger-fg shadow-lg">
          {shownError}
        </div>
      ) : null}
    </div>
  );
}

function TableHeader({ view, status, sound, onSound, onLeave }: { view: ClientTableView; status: string; sound: boolean; onSound: (on: boolean) => void; onLeave?: () => void }) {
  const { sb, bb, ante } = view.level;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <h1 className="text-[24px] font-medium sm:text-[28px]">{view.name}</h1>
      <span className="font-mono text-[15px] text-ink-2">
        Blinds {chips(sb)}/{chips(bb)}
        {ante ? ` · ante ${chips(ante)}` : ""}
      </span>
      {view.hand ? <span className="font-mono text-[15px] text-muted">Hand #{view.hand.handNo}</span> : null}
      {view.status === "paused" ? <span className="rounded-full bg-info-bg px-3 py-1 text-[13px] font-semibold text-info-fg">Paused</span> : null}
      <StatusPill status={status} />
      <div className="ml-auto flex items-center gap-2">
        <button type="button" onClick={() => onSound(!sound)} aria-pressed={sound} className="min-h-10 rounded-full border border-line px-3 text-[14px] hover:bg-surface-2">
          Sound {sound ? "on" : "off"}
        </button>
        {onLeave ? (
          <button type="button" onClick={onLeave} className="min-h-10 rounded-full border border-line px-3 text-[14px] hover:bg-surface-2">
            Leave seat
          </button>
        ) : null}
      </div>
    </div>
  );
}

function Felt({ view, now }: { view: ClientTableView; now: number }) {
  const hand = view.hand;
  const running = Boolean(hand && !hand.ended);
  const bottom = view.you?.seatNo ?? 1;
  const winners = useMemo(() => {
    const won = new Map<number, number>();
    for (const a of hand?.ended ? (hand.result?.awards ?? []) : []) for (const w of a.winners) won.set(w.seatNo, (won.get(w.seatNo) ?? 0) + w.amount);
    return won;
  }, [hand]);
  const highlight = useMemo(() => {
    const result = hand?.ended ? hand.result : null;
    if (!result?.showdown) return new Set<string>();
    const top = new Set(result.awards[0]?.winners.map((w) => w.seatNo));
    return new Set(result.shown.filter((s) => top.has(s.seatNo)).flatMap((s) => s.best5));
  }, [hand]);

  const seats = Array.from({ length: view.maxSeats }, (_, i) => i + 1);
  const pots = hand && !hand.ended ? hand.pots : [];

  return (
    <div className="relative mx-auto my-4 aspect-[3/4] w-full max-w-[560px] sm:my-6 sm:aspect-[16/10] sm:max-w-none">
      {/* Padded rail, wood trim and felt with a betting line and the logo */}
      <div className="table-rail absolute inset-[9%_4%] rounded-[999px] sm:inset-[11%_7%]">
        <div className="table-felt absolute inset-[12px] overflow-hidden rounded-[999px] sm:inset-[20px]">
          <div className="absolute inset-[7%_9%] rounded-[999px] border-2 border-white/10 sm:inset-[10%_7%]" />
          <div className="absolute inset-x-0 top-[16%] flex items-center justify-center gap-2 opacity-[0.16] sm:top-[17%]">
            {/* eslint-disable-next-line @next/next/no-img-element -- small decorative SVG */}
            <img src={brand.logo.mark} alt="" className="h-7 w-7 grayscale invert sm:h-10 sm:w-10" />
            <span className="font-[family-name:var(--font-heading-face)] text-[18px] font-semibold uppercase tracking-[0.2em] text-white sm:text-[26px]">{brand.shortName}</span>
          </div>
        </div>
      </div>

      {/* Board, pot and result */}
      <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2">
        {pots.length ? (
          <div className="flex items-end gap-3" aria-label={pots.map((p, i) => `${i === 0 ? "Pot" : "Side pot"} ${chips(p)}`).join(", ")}>
            {pots.map((p, i) => (
              <div key={i} className="flex flex-col items-center">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-white/70">{i === 0 ? "Pot" : "Side pot"}</span>
                <ChipStack amount={p} />
              </div>
            ))}
          </div>
        ) : null}
        <div className="flex gap-1 sm:gap-1.5" aria-label="Board">
          {[0, 1, 2, 3, 4].map((i) =>
            hand?.board[i] ? <PlayingCard key={hand.board[i]} card={hand.board[i]} size="md" highlight={highlight.has(hand.board[i])} /> : <CardSlot key={i} size="md" />,
          )}
        </div>
        {hand?.ended && hand.result ? (
          <div role="status" className="max-w-[240px] rounded-lg bg-black/60 px-3 py-1.5 text-center text-[13px] text-white sm:max-w-sm sm:text-[15px]">
            {hand.result.awards.map((a, i) => (
              <div key={i}>
                {a.winners.map((w) => view.players.find((p) => p.seatNo === w.seatNo)?.name ?? `Seat ${w.seatNo}`).join(" & ")} win
                {a.winners.length === 1 ? "s" : ""} {chips(a.amount)}
                {a.handName ? ` · ${a.handName}` : ""}
              </div>
            ))}
          </div>
        ) : !running ? (
          <div className="rounded-lg bg-black/45 px-3 py-1.5 text-[13px] text-white sm:text-[15px]">
            {view.players.length < 2 ? "Waiting for players…" : view.status === "paused" ? "Paused" : "Next hand starting…"}
          </div>
        ) : null}
      </div>

      {/* Bets in front of players, and the dealer button */}
      {running
        ? hand!.seats
            .filter((s) => s.bet > 0)
            .map((s) => {
              const p = around(s.seatNo, view.maxSeats, bottom, 27, 25);
              return (
                <div key={`bet${s.seatNo}`} style={{ left: `${p.x}%`, top: `${p.y}%` }} className="absolute -translate-x-1/2 -translate-y-1/2 transition-all">
                  <ChipStack amount={s.bet} />
                </div>
              );
            })
        : null}
      {seats.map((seatNo) => {
        const p = around(seatNo, view.maxSeats, bottom, 44, 42);
        const player = view.players.find((x) => x.seatNo === seatNo);
        const inHand = hand?.seats.find((s) => s.seatNo === seatNo && s.playerId === player?.playerId);
        return (
          <Seat
            key={seatNo}
            seatNo={seatNo}
            player={player}
            inHand={inHand}
            handRunning={running}
            isYou={view.you?.seatNo === seatNo}
            highlight={highlight}
            won={winners.get(seatNo) ?? 0}
            dealer={hand?.positions.buttonSeat === seatNo}
            turn={view.turn?.seatNo === seatNo ? view.turn : null}
            now={now}
            x={p.x}
            y={p.y}
          />
        );
      })}
    </div>
  );
}

function Controls({ view, signedIn, t }: { view: ClientTableView; signedIn: boolean; t: ReturnType<typeof useTable> }) {
  const hand = view.hand;
  const you = view.you;
  const box = "min-h-[76px] rounded-2xl border border-line bg-surface p-3 sm:p-4";

  if (!you) {
    if (!view.practice) return null;
    return (
      <div className={`${box} flex flex-wrap items-center gap-3`}>
        {signedIn ? (
          <button type="button" onClick={t.takeSeat} className="min-h-12 rounded-full bg-accent-strong px-7 font-[family-name:var(--font-heading-face)] text-[17px] font-semibold text-on-accent hover:brightness-110">
            Take a seat
          </button>
        ) : (
          <Link href={`/login?callbackUrl=/table/${view.tableId}`} className="font-semibold text-accent">Log in to play</Link>
        )}
        <span className="text-ink-2">You are watching this table.</span>
      </div>
    );
  }

  if (you.sittingOut) {
    return (
      <div className={`${box} flex flex-wrap items-center gap-3`}>
        <button type="button" onClick={t.sitIn} className="min-h-12 rounded-full bg-accent-strong px-7 font-[family-name:var(--font-heading-face)] text-[17px] font-semibold text-on-accent hover:brightness-110">
          I&apos;m back
        </button>
        <span className="text-ink-2">You are sitting out: your hands are checked or folded automatically.</span>
      </div>
    );
  }

  const legal = hand?.you?.legal;
  if (hand && !hand.ended && legal) {
    return (
      <div className={`${box} border-accent`}>
        <YourTurn key={`${hand.handNo}:${hand.events.length}`} hand={hand} legal={legal} onAct={(a) => t.act(hand.handNo, a)} />
      </div>
    );
  }

  const mine = hand?.seats.find((s) => s.seatNo === you.seatNo);
  if (hand && !hand.ended && mine && mine.status === "active") {
    return (
      <div className={box}>
        <PreActions value={you.preAction} onChange={t.preAction} />
      </div>
    );
  }
  return (
    <div className={`${box} flex items-center text-ink-2`}>
      {hand && !hand.ended ? (mine ? "Waiting for the hand to finish…" : "You'll be dealt in next hand.") : "Waiting for the next hand…"}
    </div>
  );
}

function HandLog({ view }: { view: ClientTableView }) {
  const hand = view.hand;
  // Remember names, so a player who busts or leaves mid-hand keeps their name in the log.
  const [names, setNames] = useState<Record<string, string>>({});
  if (view.players.some((p) => names[p.playerId] !== p.name)) setNames({ ...names, ...Object.fromEntries(view.players.map((p) => [p.playerId, p.name])) });
  const nameOf = (seatNo: number) => {
    const playerId = hand?.seats.find((s) => s.seatNo === seatNo)?.playerId;
    return (playerId && names[playerId]) || (view.players.find((p) => p.seatNo === seatNo)?.name ?? `Seat ${seatNo}`);
  };
  const lines = (hand?.events ?? []).map((e) => eventText(e, nameOf)).filter((l): l is string => Boolean(l));
  const listRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    // Keep the newest line in view by scrolling the log box only (never the page).
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [lines.length]);

  return (
    <details open className="rounded-2xl border border-line bg-surface p-3 lg:max-h-[640px]">
      <summary className="cursor-pointer font-[family-name:var(--font-heading-face)] text-[17px] font-medium">Hand log{hand ? ` · #${hand.handNo}` : ""}</summary>
      <ol ref={listRef} aria-live="polite" className="mt-2 max-h-56 space-y-1 overflow-y-auto text-[14px] text-ink-2 lg:max-h-[560px]">
        {lines.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
        {lines.length === 0 ? <li className="text-muted">No hand yet.</li> : null}
      </ol>
    </details>
  );
}
