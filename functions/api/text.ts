import {
  EDGE_CACHE_HEADER,
  formatPlainText,
  loadLotSnapshot,
  withEdgeCache,
  type PagesContext,
} from '../_lib/parklabs';

export async function onRequestGet(context: PagesContext): Promise<Response> {
  return withEdgeCache(context, async () => {
    const url = new URL(context.request.url);
    const lotId = url.searchParams.get('lotId') || 'main';
    const snapshot = await loadLotSnapshot(lotId, context.env);
    return new Response(formatPlainText(snapshot), {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': EDGE_CACHE_HEADER,
      },
    });
  });
}
