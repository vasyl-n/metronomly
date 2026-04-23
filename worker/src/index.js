const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

const CACHE_TTL = 60 * 60 * 24 * 365; // 1 year — BPM never changes

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    if (url.pathname === '/search') return handleSearch(url, env);
    if (url.pathname === '/song')   return handleSong(url, env);

    return json({ error: 'Not found' }, 404);
  },
};

async function handleSearch(url, env) {
  const query = url.searchParams.get('q');
  if (!query) return json({ error: 'Missing q param' }, 400);

  const cacheKey = `search:${query.toLowerCase().trim()}`;

  const cached = await env.BPM_CACHE.get(cacheKey);
  if (cached) return json(JSON.parse(cached));

  const res  = await fetch(
    `https://api.getsong.co/search/?api_key=${env.API_KEY}&type=song&lookup=${encodeURIComponent(query)}`
  );
  const data = await res.json();

  if (data.search?.length) {
    const results = data.search.map(r => ({
      id:     r.id,
      title:  r.title,
      artist: r.artist?.name || 'Unknown Artist',
    }));
    await env.BPM_CACHE.put(cacheKey, JSON.stringify(results), { expirationTtl: CACHE_TTL });
    return json(results);
  }

  return json([]);
}

async function handleSong(url, env) {
  const id = url.searchParams.get('id');
  if (!id) return json({ error: 'Missing id param' }, 400);

  const cacheKey = `song:${id}`;

  const cached = await env.BPM_CACHE.get(cacheKey);
  if (cached) return json(JSON.parse(cached));

  const res  = await fetch(
    `https://api.getsong.co/song/?api_key=${env.API_KEY}&id=${id}`
  );
  const data = await res.json();
  const song = data.song;

  if (!song?.tempo) return json({ error: 'Song not found' }, 404);

  const result = {
    id:      song.id,
    title:   song.title,
    artist:  song.artist?.name || 'Unknown Artist',
    bpm:     Math.round(parseFloat(song.tempo)),
    timeSig: song.time_sig || '4/4',
    key:     song.key_of || null,
  };

  await env.BPM_CACHE.put(cacheKey, JSON.stringify(result), { expirationTtl: CACHE_TTL });
  return json(result);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS_HEADERS });
}
