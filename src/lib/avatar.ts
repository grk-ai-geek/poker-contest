// Profile pictures: resized to a small square in the browser, then checked again here.

export const AVATAR_MAX_BYTES = 200 * 1024;
export const AVATAR_SIZE = 256;

/** The image type from the file's first bytes (never trust the declared type), or null if not allowed. */
export function sniffImageType(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)) return "image/png";
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}

/** Public URL of a user's uploaded picture; the version busts browser caches after a change. */
export function avatarUrlFor(userId: string, version: Date): string {
  return `/api/avatar/${userId}?v=${version.getTime()}`;
}
