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
    if (url.pathname === '/stats')  return handleStats(env);

    return json({ error: 'Not found' }, 404);
  },
};

async function handleSearch(url, env) {
  const query = url.searchParams.get('q');
  if (!query) return json({ error: 'Missing q param' }, 400);

  const cacheKey = `search:${query.toLowerCase().trim()}`;

  const cached = await env.BPM_CACHE.get(cacheKey);
  if (cached) {
    increment(env, 'searches');
    increment(env, 'cache_hits');
    return json(JSON.parse(cached));
  }

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
    increment(env, 'searches');
    increment(env, 'api_calls');
    return json(results);
  }

  increment(env, 'searches');
  increment(env, 'empty_results');
  return json([]);
}

async function handleSong(url, env) {
  const id = url.searchParams.get('id');
  if (!id) return json({ error: 'Missing id param' }, 400);

  const cacheKey = `song:${id}`;

  const cached = await env.BPM_CACHE.get(cacheKey);
  if (cached) {
    increment(env, 'song_selects');
    increment(env, 'cache_hits');
    return json(JSON.parse(cached));
  }

  const res  = await fetch(
    `https://api.getsong.co/song/?api_key=${env.API_KEY}&id=${id}`
  );
  const data = await res.json();
  const song = data.song;

  if (!song?.tempo) {
    increment(env, 'errors');
    return json({ error: 'Song not found' }, 404);
  }

  const result = {
    id:      song.id,
    title:   song.title,
    artist:  song.artist?.name || 'Unknown Artist',
    bpm:     Math.round(parseFloat(song.tempo)),
    timeSig: song.time_sig || '4/4',
    key:     song.key_of || null,
  };

  await env.BPM_CACHE.put(cacheKey, JSON.stringify(result), { expirationTtl: CACHE_TTL });
  increment(env, 'song_selects');
  increment(env, 'api_calls');
  return json(result);
}

async function handleStats(env) {
  const keys = ['searches', 'song_selects', 'cache_hits', 'api_calls', 'empty_results', 'errors'];
  const values = await Promise.all(keys.map(k => env.BPM_CACHE.get(`stats:${k}`)));
  const stats = Object.fromEntries(keys.map((k, i) => [k, parseInt(values[i] || '0')]));
  const total = stats.searches + stats.song_selects;
  stats.cache_hit_rate = total ? `${Math.round((stats.cache_hits / total) * 100)}%` : 'n/a';
  return json(stats);
}

async function increment(env, key) {
  try {
    const current = parseInt(await env.BPM_CACHE.get(`stats:${key}`) || '0');
    await env.BPM_CACHE.put(`stats:${key}`, String(current + 1));
  } catch (e) {}
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS_HEADERS });
}
