import {jsonResponse, type PagesContext} from '../_lib/parklabs';

export async function onRequestGet(context: PagesContext): Promise<Response> {
  return jsonResponse(
    {
      ok: true,
      service: 'EntrySense',
      runtime: 'cloudflare-pages-d1',
      storageBound: Boolean(context.env.PARKLABS_DB),
    },
    200,
    {'Cache-Control': 'no-store'}
  );
}
