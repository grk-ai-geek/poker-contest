/** Up to two letters: first letters of the first two words ("Bot_Ace" → "BA"), else the first two characters. */
function initials(name: string): string {
  const words = name.split(/[\s_.-]+/).filter(Boolean);
  return (words.length >= 2 ? words[0][0] + words[1][0] : name.slice(0, 2)).toUpperCase();
}

/** Round avatar: the user's picture, or their initials. */
export function Avatar({ name, src, size = 40 }: { name: string; src?: string | null; size?: number }) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.38) };
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element -- avatars come from arbitrary hosts (e.g. Google)
    return <img src={src} alt="" width={size} height={size} style={style} className="rounded-full object-cover" />;
  }
  return (
    <span aria-hidden="true" style={style} className="flex items-center justify-center rounded-full bg-surface-2 font-semibold text-ink">
      {initials(name)}
    </span>
  );
}
