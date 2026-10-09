"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { closeTable, createPracticeTable, devBotsEnabled } from "@/lib/gameServer";
import { requireAdmin } from "@/lib/session";

/** Dev only: a practice table with bots in every other seat. */
export async function startPracticeTableAction(formData: FormData) {
  await requireAdmin();
  if (!devBotsEnabled()) throw new Error("Practice tables are only available in development.");
  const maxSeats = Math.min(9, Math.max(2, Number(formData.get("maxSeats")) || 6));
  const tableId = await createPracticeTable({ bots: maxSeats - 1, maxSeats });
  redirect(`/table/${tableId}`);
}

export async function closeTableAction(formData: FormData) {
  await requireAdmin();
  await closeTable(String(formData.get("tableId")));
  revalidatePath("/admin");
}
