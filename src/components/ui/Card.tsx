import type { ComponentProps } from "react";

export function Card({ className = "", ...props }: ComponentProps<"div">) {
  return <div className={`rounded-2xl border border-line bg-surface ${className}`} {...props} />;
}

export function StatTile({ label, value, sub, valueClassName = "" }: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  valueClassName?: string;
}) {
  return (
    <Card className="flex flex-col gap-1.5 p-[18px]">
      <span className="text-xs uppercase tracking-wider text-muted">{label}</span>
      <span className={`font-mono text-[22px] font-semibold ${valueClassName}`}>{value}</span>
      {sub ? <span className="text-[13px] text-muted">{sub}</span> : null}
    </Card>
  );
}
