// test/index.spec.ts
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, vi } from 'vitest';
import worker from '../src/index';

// For now, you'll need to do something like this to get a correctly-typed
// `Request` to pass to `worker.fetch()`.
const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe('Llama TVL Worker', () => {
	it('returns 400 when protocol slug is missing', async () => {
		const request = new IncomingRequest('http://example.com/');
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(400);
		expect(await response.text()).toBe('Protocol slug missing in path');
	});

	it('returns 502 when upstream request fails', async () => {
		// Mock global fetch to simulate upstream failure
		const originalFetch = global.fetch;
		global.fetch = vi.fn().mockResolvedValue(new Response('Not Found', { status: 404 }));

		const request = new IncomingRequest('http://example.com/someprotocol');
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(502);
		expect(await response.text()).toBe('Upstream error (404)');

		// Restore original fetch
		global.fetch = originalFetch;
	});

	it('correctly combines TVL data from Unichain and Unichain-borrowed', async () => {
		// Mock the upstream response
		const mockData = {
			chainTvls: {
				Unichain: {
					tvl: [
						{ date: 1000, totalLiquidityUSD: 100 },
						{ date: 2000, totalLiquidityUSD: 200 },
					],
				},
				'Unichain-borrowed': {
					tvl: [
						{ date: 1000, totalLiquidityUSD: 50 },
						{ date: 2000, totalLiquidityUSD: 75 },
					],
				},
			},
		};

		const originalFetch = global.fetch;
		global.fetch = vi.fn().mockResolvedValue(
			new Response(JSON.stringify(mockData), {
				headers: { 'Content-Type': 'application/json' },
			}),
		);

		const request = new IncomingRequest('http://example.com/testprotocol');
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(200);
		expect(response.headers.get('Content-Type')).toBe('application/json');

		const responseData = await response.json();
		expect(responseData).toEqual({
			protocol: 'testprotocol',
			tvl: [
				{ date: 1000, totalLiquidityUSD: 150 }, // 100 + 50
				{ date: 2000, totalLiquidityUSD: 275 }, // 200 + 75
			],
		});

		// Restore original fetch
		global.fetch = originalFetch;
	});

	it('handles missing chain data gracefully', async () => {
		// Mock the upstream response with missing chain data
		const mockData = {
			chainTvls: {
				Unichain: {
					tvl: [{ date: 1000, totalLiquidityUSD: 100 }],
				},
				// Unichain-borrowed is missing
			},
		};

		const originalFetch = global.fetch;
		global.fetch = vi.fn().mockResolvedValue(
			new Response(JSON.stringify(mockData), {
				headers: { 'Content-Type': 'application/json' },
			}),
		);

		const request = new IncomingRequest('http://example.com/testprotocol');
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(200);

		const responseData = await response.json();
		expect(responseData).toEqual({
			protocol: 'testprotocol',
			tvl: [{ date: 1000, totalLiquidityUSD: 100 }],
		});

		// Restore original fetch
		global.fetch = originalFetch;
	});
});
