import { db } from "@/lib/db";

// Uploaded profile pictures. URLs carry a version (?v=…), so each one can be cached for a long time.
export async function GET(_req: Request, ctx: RouteContext<"/api/avatar/[userId]">) {
  const { userId } = await ctx.params;
  const avatar = await db.userAvatar.findUnique({ where: { userId } });
  if (!avatar) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(avatar.data), {
    headers: {
      "Content-Type": avatar.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
