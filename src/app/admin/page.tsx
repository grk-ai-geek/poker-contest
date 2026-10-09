import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { devBotsEnabled, listTables } from "@/lib/gameServer";
import { requireAdmin } from "@/lib/session";
import { closeTableAction, startPracticeTableAction } from "./actions";

export const metadata = { title: "Admin" };

export default async function AdminPage() {
  const admin = await requireAdmin();
  const bots = devBotsEnabled();
  const tables = await listTables();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-[32px] font-medium">Admin</h1>
      <Card className="p-6">
        <p className="text-ink-2">Signed in as <strong>{admin.displayName}</strong>. Tournament management arrives in M5.</p>
      </Card>

      <Card className="flex flex-col gap-4 p-6">
        <h2 className="text-[22px] font-medium">Tables</h2>
        {tables === null ? (
          <p className="text-danger">The game server isn&apos;t running. Start it with <code>npm run server</code> (or <code>npm run dev:all</code>).</p>
        ) : tables.length === 0 ? (
          <p className="text-ink-2">No tables running.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {tables.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-3">
                <Link href={`/table/${t.id}`} className="font-semibold text-accent">{t.name}</Link>
                <span className="text-ink-2">{t.players} seated{t.practice ? " · practice" : ""}</span>
                <form action={closeTableAction}>
                  <input type="hidden" name="tableId" value={t.id} />
                  <Button type="submit" variant="ghost" size="sm">Close</Button>
                </form>
              </li>
            ))}
          </ul>
        )}
        {bots && tables !== null ? (
          <form action={startPracticeTableAction} className="flex flex-wrap items-end gap-3 border-t border-line pt-4">
            <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
              Seats
              <select name="maxSeats" defaultValue="6" className="min-h-11 rounded-md border border-field bg-surface px-3 text-base font-normal">
                {[2, 3, 4, 5, 6, 7, 8, 9].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <Button type="submit">Start practice table with bots</Button>
            <p className="w-full text-[13px] text-muted">Development only: bots fill every other seat and only play while a real person is seated.</p>
          </form>
        ) : null}
      </Card>
    </div>
  );
}
