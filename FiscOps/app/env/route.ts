import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  const body = `window.__FISCOPS_ENV__ = { SUPABASE_URL: ${JSON.stringify(url)}, SUPABASE_ANON_KEY: ${JSON.stringify(key)} };`;
  return new NextResponse(body, {
    status: 200,
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
