const ORIGIN = 'https://serve-b2yc5zhtxa-uc.a.run.app';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET',
        },
      });
    }

    if (request.method !== 'GET') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const originUrl = `${ORIGIN}${url.pathname}${url.search}`;

    const response = await fetch(originUrl, {
      cf: {
        cacheEverything: true,  // cache even image/* responses
        cacheTtl: 86400,        // 1 day — matches Cache-Control from serve fn
      },
    });

    // Pass through the response, adding CORS header
    const headers = new Headers(response.headers);
    headers.set('Access-Control-Allow-Origin', '*');

    return new Response(response.body, {
      status: response.status,
      headers,
    });
  },
};
