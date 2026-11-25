import {processParkLabsSync, type PagesContext} from '../../_lib/parklabs';

export async function onRequestPost(context: PagesContext): Promise<Response> {
  return processParkLabsSync(context.request, context.env);
}
