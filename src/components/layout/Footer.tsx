import { brand } from "@/config/brand";

export function Footer() {
  return (
    <footer className="mt-auto border-t border-line bg-surface">
      <div className="page-x flex flex-wrap justify-between gap-3 py-6 text-[14px] text-muted">
        <span>Play money only: no real money is wagered or won. Tournament chips have no cash value.</span>
        <span>© {new Date().getFullYear()} {brand.name}</span>
      </div>
    </footer>
  );
}
