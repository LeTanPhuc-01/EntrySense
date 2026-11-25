import {
  EDGE_CACHE_HEADER,
  formatPlainText,
  jsonResponse,
  loadLotSnapshot,
  processParkLabsSync,
  withEdgeCache,
  type PagesContext,
  type PagesEnv,
} from './functions/_lib/parklabs';

interface WorkerEnv extends PagesEnv {
  ASSETS?: {fetch(request: Request): Promise<Response>};
}

interface WorkerExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

export default {
  async fetch(
    request: Request,
    env: WorkerEnv,
    ctx: WorkerExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const method = request.method.toUpperCase();

    const pagesCtx: PagesContext = {
      request,
      env,
      params: {},
      waitUntil: (promise) => ctx.waitUntil(promise),
    };

    if (pathname === '/api/health' && method === 'GET') {
      return jsonResponse(
        {
          ok: true,
          service: 'EntrySense',
          runtime: 'cloudflare-worker-d1',
          storageBound: Boolean(env.PARKLABS_DB),
        },
        200,
        {'Cache-Control': 'no-store'}
      );
    }

    if (pathname === '/api/occupancy' && method === 'GET') {
      return withEdgeCache(pagesCtx, async () => {
        const lotId = url.searchParams.get('lotId') || 'main';
        const snapshot = await loadLotSnapshot(lotId, env);
        return jsonResponse(snapshot, 200, {
          'Cache-Control': EDGE_CACHE_HEADER,
          'X-EntrySense-Realtime': 'poll',
        });
      });
    }

    if (pathname === '/api/text' && method === 'GET') {
      return withEdgeCache(pagesCtx, async () => {
        const lotId = url.searchParams.get('lotId') || 'main';
        const snapshot = await loadLotSnapshot(lotId, env);
        return new Response(formatPlainText(snapshot), {
          status: 200,
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': EDGE_CACHE_HEADER,
          },
        });
      });
    }

    if (pathname === '/api/parklabs/sync' && method === 'POST') {
      return processParkLabsSync(request, env);
    }

    const lotSyncMatch = pathname.match(/^\/api\/lots\/([^/]+)\/parklabs\/sync$/);
    if (lotSyncMatch && method === 'POST') {
      return processParkLabsSync(request, env, decodeURIComponent(lotSyncMatch[1]));
    }

    const lotOccMatch = pathname.match(/^\/api\/lots\/([^/]+)\/occupancy$/);
    if (lotOccMatch && method === 'GET') {
      const lotId = decodeURIComponent(lotOccMatch[1]);
      return withEdgeCache(pagesCtx, async () => {
        const snapshot = await loadLotSnapshot(lotId, env);
        return jsonResponse(snapshot, 200, {
          'Cache-Control': EDGE_CACHE_HEADER,
          'X-EntrySense-Realtime': 'poll',
        });
      });
    }

    if (pathname.startsWith('/api/')) {
      return jsonResponse({error: 'API endpoint not found.'}, 404, {'Cache-Control': 'no-store'});
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('Not found', {status: 404});
  },
};
