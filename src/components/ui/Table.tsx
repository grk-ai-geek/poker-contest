import type { ComponentProps } from "react";

/** Plain data table with the site's row style; wraps in a horizontal scroller on small screens. */
export function Table({ className = "", ...props }: ComponentProps<"table">) {
  return (
    <div className="overflow-x-auto">
      <table className={`w-full border-collapse text-left text-[15px] [&_td]:border-t [&_td]:border-line-soft [&_td]:px-3 [&_td]:py-2.5 [&_th]:px-3 [&_th]:py-2 [&_th]:text-xs [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wider [&_th]:text-muted ${className}`} {...props} />
    </div>
  );
}
