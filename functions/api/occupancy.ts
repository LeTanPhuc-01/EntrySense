import {
  EDGE_CACHE_HEADER,
  jsonResponse,
  loadLotSnapshot,
  withEdgeCache,
  type PagesContext,
} from '../_lib/parklabs';

export async function onRequestGet(context: PagesContext): Promise<Response> {
  return withEdgeCache(context, async () => {
    const url = new URL(context.request.url);
    const lotId = url.searchParams.get('lotId') || 'main';
    const snapshot = await loadLotSnapshot(lotId, context.env);
    return jsonResponse(snapshot, 200, {
      'Cache-Control': EDGE_CACHE_HEADER,
      'X-EntrySense-Realtime': 'poll',
    });
  });
}
