import { Card } from "@/components/ui/Card";
import { requireUser } from "@/lib/session";
import { AvatarUploader } from "./AvatarUploader";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-[32px] font-medium">Settings</h1>
      <Card className="flex flex-col gap-4 p-6">
        <h2 className="text-[22px] font-medium">Profile picture</h2>
        <AvatarUploader name={user.displayName} current={user.avatarUrl} />
      </Card>
      <Card className="flex flex-col gap-1 p-6">
        <h2 className="text-[22px] font-medium">Account</h2>
        <p className="text-ink-2">Display name: <strong>{user.displayName}</strong></p>
        <p className="text-ink-2">Email: {user.email}</p>
      </Card>
    </div>
  );
}
