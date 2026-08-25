import type { NextRequest } from "next/server";
import {
  searchPublicPlayers,
} from "@/lib/player-search/repository";
import {
  normalizePlayerSearchQuery,
  PLAYER_SEARCH_MAX_LENGTH,
  PLAYER_SEARCH_MIN_LENGTH,
} from "@/lib/player-search/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const query = normalizePlayerSearchQuery(
    request.nextUrl.searchParams.get("q") || "",
  );

  if (query.length > PLAYER_SEARCH_MAX_LENGTH) {
    return Response.json(
      {
        ok: false,
        error: {
          code: "query_too_long",
          message: "عبارت جست‌وجو بیش از حد طولانی است",
        },
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (query.length < PLAYER_SEARCH_MIN_LENGTH) {
    return Response.json(
      { ok: true, results: [] },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const results = await searchPublicPlayers(query);
  return Response.json(
    { ok: true, results },
    { headers: { "Cache-Control": "no-store" } },
  );
}
