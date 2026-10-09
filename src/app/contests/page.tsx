import { Card } from "@/components/ui/Card";

export const metadata = { title: "Tournaments" };

export default function ContestsPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-[32px] font-medium">Tournaments</h1>
      <Card className="p-6">
        <p className="text-ink-2">No tournaments yet. The lobby arrives in M5.</p>
      </Card>
    </div>
  );
}
