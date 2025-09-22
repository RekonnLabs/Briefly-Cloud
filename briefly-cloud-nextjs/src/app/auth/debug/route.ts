import { headers } from "next/headers";

export const runtime = "nodejs";

export async function GET() {
  const raw = headers().get("cookie") ?? "";
  const names = raw.split(";").map(s => s.trim().split("=")[0]).filter(Boolean);
  return new Response(JSON.stringify({ names }, null, 2), { 
    status: 200, 
    headers: { "content-type": "application/json" } 
  });
}
