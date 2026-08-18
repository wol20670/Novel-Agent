// 대사 한 줄의 "최종 표정" 판정 — 단일 소스.
//
// 예전엔 이 계산이 5곳에 흩어져 각자 `line.emotion ?? inferEmotion(...)` 을 다시 짰다
// (generate.ts 의 expressionPlan/resolveSprites/scriptBody, ScenePlayer, SceneCard). 표정이 6종일
// 땐 버텼지만 24종 + AI 배정이 들어오면 판정 규칙이 한 곳에 있어야 한다.
//
// **동기·순수 함수여야 한다** — React 두 곳(ScenePlayer/SceneCard)이 렌더 중에 부르기 때문에
// async 로 만들 수 없다. 그래서 AI 배정은 "렌더 시점 조회"가 아니라 **미리 계산해 Line 에 저장**하는
// 방식(emotionAuto)이고, 이 함수는 저장된 값을 우선순위대로 고르기만 한다.
//
// ⚠️ 후보 집합이 **두 종류**다. 섞으면 안 된다:
//   · declaredExpressions  = effectiveExpressions(project.expressions) — 프로젝트가 "쓰겠다"고 선언한 목록.
//     최종 판정은 이걸로 검증한다. 선언은 됐지만 아직 업로드 안 한 표정은 **통과시켜야 한다** —
//     그래야 기존의 "업로드 전엔 임시 실루엣(Canvas 플레이스홀더)" 워크플로가 유지된다.
//   · availableExpressions = 그 의상으로 **실제 화면에 세울 수 있는** 표정. **AI 가 고를 수 있는 후보**는
//     이쪽이다(사용자 확정) — 아직 그림 없는 표정을 AI 가 고르면 게임에 임시 그림이 섞여 나가기 때문.
//     판정은 화면(selectSprite)의 **pool 규칙**과 같아야 한다(아래 함수 주석).

import type { Character, Expression, Line, Project, Scene } from '../../types';
import { effectiveExpressions } from '../../types';
import { inferEmotion } from './infer';

/** assetId 가 실제로 채워진 표정만 — 빈 문자열·undefined 슬롯은 그림이 없는 것과 같다. */
function uploadedExpressions(map: Partial<Record<Expression, string>>): Set<Expression> {
  const out = new Set<Expression>();
  for (const [expr, id] of Object.entries(map)) if (id) out.add(expr);
  return out;
}

/**
 * 그 캐릭터를 **그 의상으로 화면에 세웠을 때 실제로 표시되는** 표정 집합 — AI 프롬프트의 후보
 * 목록·응답 검증용.
 *
 * ⚠️ **판정은 화면의 폴백 사다리(`selectSprite`, renpy/generate.ts)와 같은 pool 규칙이어야 한다.**
 * 화면은 폴백을 *표정 단위*가 아니라 **pool 단위**로 한다: 요청 의상의 칸이 하나라도 있으면 그 pool
 * 안에서만 고르고(그 pool 에 없는 표정은 neutral → pool[0] 으로 **강등**), **칸이 하나도 없을 때만**
 * 기본 의상 pool 로 내려간다.
 * 예전엔 여기서 `spriteAssetId`(표정 단위로 기본 의상에 폴백)를 써서 **부분 업로드된 추가 의상에
 * 표시될 수 없는 표정이 후보로 실렸다** — AI 가 그걸 고르면 ① 유료 호출이 조용히 무효화되고
 * ② 그 줄은 emotionAuto 가 채워져 증분 재실행에서 영구 스킵되며 ③ 대본 카드의 🤖 라벨과 실제 게임
 * 얼굴이 어긋났다(Phase 9 D4). **그러니 여기서 `spriteAssetId` 를 부르면 안 된다 — 그 폴백이 결함의
 * 원천이다.** 렌더러 쪽(Phase 9 계약)은 canonical 이라 건드리지 않는다.
 *
 * ⚠️ `generate.ts` 를 import 하지 않는다(그쪽이 이 모듈을 import 하므로 순환이 된다). 후보를 "그 의상이
 * **직접** 소유한 표정"으로 좁히면 `selectSprite` 의 `pool.some((o) => o.attr === wantAttr)` 이 항상
 * 참이라 import 없이도 결과가 일치한다. D5(속성 해시 충돌)는 pool 내부 승자 문제라 기존과 같이 범위 밖.
 *
 * ⚠️ 반환은 **Set(멤버십 전용)** 이다. 후보 **순서**의 정본은 호출측(`aiSelect.ts` 의
 * `declaredOrder.filter((e) => avail.has(e))`)이 쓰는 `effectiveExpressions(project.expressions)` =
 * 프로젝트 선언 순서다 — 여기의 iteration 순서를 계약으로 삼지 말 것(asset 삽입 순서가 프롬프트
 * 바이트로 샌다).
 */
export function availableExpressions(c: Character, outfit?: string): Set<Expression> {
  if (outfit && outfit !== '기본') {
    // 그 의상이 **직접** 소유한 것만 본다(기본 의상 폴백 금지 — 위 주석).
    const own = uploadedExpressions(c.outfits?.find((o) => o.name === outfit)?.expressions ?? {});
    if (own.size) return own; // 칸이 하나라도 있으면 화면은 기본 의상 pool 을 절대 보지 않는다
  }
  return uploadedExpressions(c.expressions); // 기본 의상 · 칸이 0개인 추가 의상 → base pool 재진입
}

/** 판정 근거 — UI 가 "사람이 정한 것 / AI 가 고른 것"을 구분해 보여주기 위한 값. */
export type EmotionSource = 'author' | 'ai' | 'heuristic' | 'fallback';

export interface ResolvedEmotion {
  expr: Expression;
  source: EmotionSource;
}

/**
 * 우선순위:  작가 태그/수동(emotion) > AI(emotionAuto) > 휴리스틱(inferEmotion) > '기본'
 *
 * ⚠️ **작가가 쓴 emotion 은 검증하지 않는다.** 파서가 `이름(당황):` 태그를 "작가 신뢰" 원칙으로
 * 자유 문자열 그대로 채택하기 때문이다(parser/sceneBuilder.ts). 여기서 선언 목록으로 걸러버리면
 * 대본에 적어둔 표정이 조용히 무시되고, 표정 편집기에 미리 등록하지 않으면 태그가 안 먹는
 * 숨은 규칙이 생긴다 — 기존 동작(그 이름으로 슬롯을 만들고 임시 그림을 채움)을 그대로 둔다.
 * 수동 선택분도 애초에 선언 목록에서 고른 값이라 검증할 게 없다.
 *
 * 검증이 필요한 건 **사람이 안 쓴 값**뿐이다:
 *  · 휴리스틱(inferEmotion)은 project.expressions 를 모른 채 옛 기본 6종만 반환한다 — 사용자가 24종
 *    커스텀 세트를 쓰면 그 이름이 목록에 없는데, 그대로 채택하면 expressionPlan 이 유령 슬롯을 만들고
 *    buildZip 이 플레이스홀더를 게임에 넣는다(사용자는 에셋 탭에서 그 표정을 보지도 못한다).
 *  · AI(emotionAuto)는 후보 목록을 주고 받지만 그래도 목록 밖 이름이 올 수 있어 최종 방어선을 둔다.
 * 무효면 그 단계만 건너뛰고 다음 후보를 본다(바로 '기본'으로 떨어뜨리지 않는다).
 */
export function resolveEmotionDetailed(
  line: Line,
  scene: Scene,
  // 전체 Project 가 아니라 실제로 읽는 필드만 받는다 — UI 는 whole-project 구독이 금지라(CLAUDE.md)
  // `{ expressions }` 같은 부분 객체를 넘기는데, 파라미터가 Project 면 `as Project` 캐스팅을 강요당하고
  // 나중에 이 함수가 필드를 하나 더 읽는 순간 그 캐스팅이 런타임 undefined 로 조용히 터진다.
  // Pick 으로 두면 필드가 늘 때 **모든 호출부가 컴파일 에러**로 드러난다.
  project: Pick<Project, 'expressions'>,
): ResolvedEmotion {
  if (line.kind !== 'dialogue') return { expr: '기본', source: 'fallback' };
  const declared = new Set(effectiveExpressions(project.expressions));

  const ok = (v: string | undefined): v is string => !!v && declared.has(v);
  // 작가 태그는 검증 없이 그대로(위 주석 참고 — 파서의 "작가 신뢰" 계약을 깨지 않는다).
  if (line.emotion) return { expr: line.emotion, source: 'author' };
  if (ok(line.emotionAuto)) return { expr: line.emotionAuto, source: 'ai' };

  const guess = inferEmotion(line.text, { direction: scene.direction, background: scene.background });
  if (ok(guess)) return { expr: guess, source: 'heuristic' };

  return { expr: '기본', source: 'fallback' };
}

/** 값만 필요할 때(생성기·미리보기). 판정 근거까지 필요하면 resolveEmotionDetailed. */
export function resolveEmotion(line: Line, scene: Scene, project: Pick<Project, 'expressions'>): Expression {
  return resolveEmotionDetailed(line, scene, project).expr;
}
