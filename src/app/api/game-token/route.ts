import { NextResponse } from "next/server";
import { signGameToken } from "@/lib/gameToken";
import { getCurrentUser } from "@/lib/session";

// Short-lived token for the game server's WebSocket (design.md §6.3).
// Signed-out visitors get no token and connect as spectators.
export async function GET() {
  const user = await getCurrentUser();
  const wsUrl = process.env.NEXT_PUBLIC_GAME_WS_URL ?? "ws://localhost:4000/ws";
  if (!user) return NextResponse.json({ token: null, wsUrl }, { headers: { "Cache-Control": "no-store" } });
  const token = await signGameToken({ userId: user.id, name: user.displayName, role: user.role });
  return NextResponse.json({ token, wsUrl }, { headers: { "Cache-Control": "no-store" } });
}
