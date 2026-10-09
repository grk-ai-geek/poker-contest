import { Card } from "@/components/ui/Card";
import { requireAdmin } from "@/lib/session";

export const metadata = { title: "Admin" };

export default async function AdminPage() {
  const admin = await requireAdmin();
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-[32px] font-medium">Admin</h1>
      <Card className="p-6">
        <p className="text-ink-2">Signed in as <strong>{admin.displayName}</strong>. Tournament management arrives in M5.</p>
      </Card>
    </div>
  );
}
