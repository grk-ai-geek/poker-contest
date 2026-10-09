import { ButtonLink } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <div className="flex flex-col items-start gap-4">
      <h1 className="text-[32px] font-medium">Page not found</h1>
      <p className="text-ink-2">This page folded. Try the lobby instead.</p>
      <ButtonLink href="/contests">Go to tournaments</ButtonLink>
    </div>
  );
}
