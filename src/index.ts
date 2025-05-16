interface LlamaResponse {
	chainTvls?: Record<string, { tvl: Array<{ date: number; totalLiquidityUSD: number }> }>;
}

export default {
	async fetch(request: Request, _env: Env, _ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);
		const parts = url.pathname.split('/').filter(Boolean);
		const proto = parts.pop();
		if (!proto) {
			return new Response('Protocol slug missing in path', { status: 400 });
		}
		try {
			const upstream = await fetch(`https://api.llama.fi/protocol/${proto}`);
			if (!upstream.ok) {
				return new Response(`Upstream error (${upstream.status})`, { status: 502 });
			}
			const json = (await upstream.json()) as LlamaResponse;

			const unichainTvl = json.chainTvls?.['Unichain']?.tvl ?? [];
			const unichainBorrowedTvl = json.chainTvls?.['Unichain-borrowed']?.tvl ?? [];

			// Create a map of date to combined TVL
			const combinedTvlMap = new Map<number, number>();

			// Add TVLs from Unichain
			unichainTvl.forEach(({ date, totalLiquidityUSD }) => {
				combinedTvlMap.set(date, (combinedTvlMap.get(date) || 0) + totalLiquidityUSD);
			});

			// Add TVLs from Unichain-borrowed
			unichainBorrowedTvl.forEach(({ date, totalLiquidityUSD }) => {
				combinedTvlMap.set(date, (combinedTvlMap.get(date) || 0) + totalLiquidityUSD);
			});

			// Convert map back to array format
			const combinedTvl = Array.from(combinedTvlMap.entries())
				.map(([date, totalLiquidityUSD]) => ({
					date,
					totalLiquidityUSD,
				}))
				.sort((a, b) => a.date - b.date);

			return new Response(JSON.stringify({ protocol: proto, tvl: combinedTvl }), {
				headers: { 'Content-Type': 'application/json' },
			});
		} catch (err) {
			return new Response('Fetch failed', { status: 502 });
		}
	},
} satisfies ExportedHandler<Env>;
