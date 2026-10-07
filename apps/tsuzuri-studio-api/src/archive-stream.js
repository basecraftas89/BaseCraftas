// Drive source access stays with the service account. No customer permissions are created.
export async function streamMemberArchive(request, env, id, {authorize, tokenFor, fetcher = fetch}) {
  const auth = await authorize(request, env);
  if (auth.error) return auth.error;
  const fail = (status, error) => Response.json({error}, {status, headers: {'cache-control': 'private, no-store'}});
  if (!/^[A-Za-z0-9_-]{10,150}$/.test(id)) return fail(404, 'archive_not_found');
  // Fixed archive root: never accept a folder ID supplied by a client.
  const root = '12YHtKFODi75v_W08xFACzm97DjFIUCjg';
  const token = await tokenFor(env);
  const url = 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(id);
  const metadata = await fetcher(url + '?fields=id,parents,trashed,mimeType', {
    headers: {authorization: 'Bearer ' + token}, signal: AbortSignal.timeout(10000)
  });
  if (!metadata.ok) return fail(metadata.status === 404 ? 404 : 502, 'archive_unavailable');
  const file = await metadata.json();
  if (file.id !== id || file.trashed || !Array.isArray(file.parents) || !file.parents.includes(root) || !/^(audio|video)\//.test(file.mimeType || '')) return fail(404, 'archive_not_found');
  const headers = new Headers({authorization: 'Bearer ' + token});
  const range = request.headers.get('range');
  if (range && !/^bytes=\d*-\d*$/.test(range)) return fail(416, 'invalid_range');
  if (range) headers.set('range', range);
  const upstream = await fetcher(url + '?alt=media', {headers, signal: request.signal});
  if (![200, 206].includes(upstream.status) || !upstream.body) {
    upstream.body?.cancel();
    return fail([404,416].includes(upstream.status) ? upstream.status : 502, 'archive_unavailable');
  }
  const output = new Headers({'content-type': file.mimeType, 'content-disposition': 'inline',
    'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff', 'accept-ranges': 'bytes', 'vary': 'Cookie'});
  for (const key of ['content-length', 'content-range']) if (upstream.headers.has(key)) output.set(key, upstream.headers.get(key));
  return new Response(upstream.body, {status: upstream.status, headers: output});
}
