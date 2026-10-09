import { PokerTable } from "@/components/table/PokerTable";
import { getCurrentUser } from "@/lib/session";

export const metadata = { title: "Table" };

export default async function TablePage({ params }: PageProps<"/table/[id]">) {
  const { id } = await params;
  const user = await getCurrentUser();
  return <PokerTable tableId={id} signedIn={Boolean(user)} />;
}
