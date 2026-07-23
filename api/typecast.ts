// Vercel Edge 함수 — Typecast API(https://api.typecast.ai) 프록시.
// 브라우저 직접 호출은 CORS로 막힐 수 있어 같은 origin(/api/typecast)으로 중계만 한다.
// 키(X-API-KEY, 업스트림과 동일한 헤더명)는 요청 헤더를 그대로 통과시킬 뿐 서버에 저장하지
// 않는다(BYO 키 원칙 유지). 브라우저↔프록시↔업스트림이 같은 헤더명을 쓰므로 로컬 dev 프록시
// (vite.config.ts, 헤더를 리라이트하지 않음)에서도 별도 변환 없이 그대로 통과한다.
//
// 실제 Typecast 하위경로는 ?path= 쿼리로 받는다(고정 경로 하나만 씀) — 이전 TTS 프록시에서
// api/<vendor>/[...path].ts catch-all 이 이 프로젝트(Vite, 비-Next.js)의 Vercel 배포에서
// 경로 2단계 이상을 전부 404 내는 걸 확인해 이 방식으로 통일했다(1단계 경로는 정상이었음).
//
// ⚠️ Typecast 는 리소스마다 API 버전이 다르다(TTS=v1, voices=v2, subscription=v1) — 그래서
// UPSTREAM 은 버전을 포함하지 않고, path 쿼리 쪽(예: 'v1/text-to-speech', 'v2/voices')이
// 자기 버전을 직접 갖는다(typecastProvider.ts 참고).

export const config = { runtime: 'edge' };

const UPSTREAM = 'https://api.typecast.ai';

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.searchParams.get('path') ?? '';
  url.searchParams.delete('path');
  const target = `${UPSTREAM}/${path}${url.search}`;

  const apiKey = req.headers.get('X-API-KEY');
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'X-API-KEY 헤더가 없습니다.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const hasBody = !['GET', 'HEAD'].includes(req.method);
  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers: {
        'X-API-KEY': apiKey,
        ...(hasBody ? { 'Content-Type': req.headers.get('content-type') ?? 'application/json' } : {}),
      },
      body: hasBody ? await req.text() : undefined,
    });
    return new Response(upstream.body, { status: upstream.status, headers: upstream.headers });
  } catch {
    return new Response(JSON.stringify({ error: 'Typecast 서버에 연결하지 못했습니다.' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
