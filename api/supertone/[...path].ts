// Vercel Edge 함수 — Supertone API(https://supertoneapi.com/v1) 프록시.
// 브라우저 직접 호출은 CORS로 막힐 수 있어 같은 origin(/api/supertone/*)으로 중계만 한다.
// 키(x-sup-api-key)는 요청 헤더를 그대로 통과시킬 뿐 서버에 저장하지 않는다(BYO 키 원칙 유지).

export const config = { runtime: 'edge' };

const UPSTREAM = 'https://supertoneapi.com/v1';

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/supertone\/?/, '');
  const target = `${UPSTREAM}/${path}${url.search}`;

  const apiKey = req.headers.get('x-sup-api-key');
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'x-sup-api-key 헤더가 없습니다.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const hasBody = !['GET', 'HEAD'].includes(req.method);
  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers: {
        'x-sup-api-key': apiKey,
        ...(hasBody ? { 'Content-Type': req.headers.get('content-type') ?? 'application/json' } : {}),
      },
      body: hasBody ? await req.text() : undefined,
    });
    return new Response(upstream.body, { status: upstream.status, headers: upstream.headers });
  } catch {
    return new Response(JSON.stringify({ error: 'Supertone 서버에 연결하지 못했습니다.' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
