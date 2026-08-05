// OpenAI Chat(JSON 모드)로 테마 "코어 색/스타일"을 생성. 브라우저에서 직접 호출(BYO Key).
// 핵심 원칙: LLM 은 .rpy 코드가 아니라 스키마로 제약된 JSON 만 출력 → buildTheme 이 안전 변환.

import type { ThemeCore } from './buildTheme';
import { aiConfig } from '../../config/aiConfig';

interface OpenAIThemeOpts {
  apiKey: string;
  model?: string;
}

const SYSTEM = `당신은 비주얼노벨 GUI 아트디렉터입니다. 장르·시놉시스·분위기에 맞는
Ren'Py 비주얼노벨의 메인 메뉴 & 대사 UI "색 팔레트"를 설계합니다.
반드시 아래 JSON 스키마 그대로, 다른 설명 없이 JSON 객체 하나만 출력하세요.

{
  "accent": "#rrggbb",        // 강조색(이름/포인트/타이틀)
  "bgTop": "#rrggbb",         // 메뉴 배경 그라데이션 위
  "bgBottom": "#rrggbb",      // 메뉴 배경 그라데이션 아래
  "interfaceText": "#rrggbb", // 메뉴 글자색
  "dialogueBox": "#rrggbb",   // 대사창 베이스색(불투명 기준)
  "dialogueText": "#rrggbb",  // 대사 글자색
  "nameText": "#rrggbb",      // 화자 이름색
  "sceneTransition": "dissolve | fade",
  "rationale": "한 줄 컨셉 설명(한국어)"
}

규칙:
- 모든 색은 #rrggbb 6자리 hex.
- 밝은 분위기 → 라이트 배경 + 어두운 글자, 어두운 분위기 → 다크 배경 + 밝은 글자.
- dialogueBox 위의 dialogueText 는 반드시 잘 읽히도록 높은 대비로.`;

const COLOR_KEYS = ['accent', 'bgTop', 'bgBottom', 'interfaceText', 'dialogueBox', 'dialogueText', 'nameText'] as const;

/** context(장르/제목/시놉시스/분위기) → ThemeCore 부분값. 실패 시 throw. */
export async function openaiTheme(context: string, opts: OpenAIThemeOpts): Promise<Partial<ThemeCore>> {
  const res = await fetch(aiConfig.chat.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify({
      model: opts.model ?? aiConfig.chat.themeModel,
      temperature: aiConfig.chat.temperature,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: context },
      ],
    }),
  });

  if (!res.ok) {
    let msg = `OpenAI 테마 생성 실패 (HTTP ${res.status})`;
    try {
      const j = await res.json();
      if (j?.error?.message) msg += `: ${j.error.message}`;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }

  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenAI 응답에 내용이 없습니다.');

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('OpenAI 응답을 JSON 으로 해석하지 못했습니다.');
  }

  const out: Partial<ThemeCore> = {};
  for (const k of COLOR_KEYS) {
    if (typeof parsed[k] === 'string') (out as Record<string, unknown>)[k] = parsed[k];
  }
  if (parsed.sceneTransition === 'fade' || parsed.sceneTransition === 'dissolve') {
    out.sceneTransition = parsed.sceneTransition;
  }
  if (typeof parsed.rationale === 'string') out.rationale = parsed.rationale;
  return out;
}
