// Server-side proxy for CoinGecko so the browser never calls it directly
// (avoids CORS) and responses are cached to dodge 429 rate limits.

const IDS = [
  "bitcoin",
  "ethereum",
  "solana",
  "binancecoin",
  "ripple",
  "cardano",
  "dogecoin",
  "avalanche-2",
  "polkadot",
  "chainlink",
  "matic-network",
  "litecoin",
  "uniswap",
  "cosmos",
  "near",
].join(",");

// Cache the upstream call for 60s (shared across all visitors).
export const revalidate = 60;

export async function GET() {
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${IDS}&vs_currencies=usd&include_24hr_change=true`,
      { next: { revalidate: 60 }, headers: { accept: "application/json" } }
    );
    if (!res.ok) {
      return Response.json({}, { status: 200 });
    }
    const data = await res.json();
    return Response.json(data, {
      headers: { "cache-control": "public, s-maxage=60, stale-while-revalidate=300" },
    });
  } catch {
    return Response.json({}, { status: 200 });
  }
}
