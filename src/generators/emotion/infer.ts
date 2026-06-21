// 대사·문맥 → 표정 추론 (오프라인, 결정적).
// "어떤 표정을 보여줄지" 결정하는 두뇌. 키워드/문장부호 기반 한국어 휴리스틱이라
// API 키가 없어도 동작하며, 추후 LLM 분류기로 정확도만 업그레이드한다(같은 인터페이스).
//   - 입력: 대사 텍스트 + 장면 맥락(연출 노트·배경)
//   - 출력: 표준 표정 6종 중 하나 (types.EXPRESSIONS)

import type { Expression } from '../../types';

export interface EmotionContext {
  /** 장면 연출 노트(#연출). 분위기 신호로 가중 반영. */
  direction?: string[];
  /** 장면 배경(#배경). 장례식/축제 등 강한 신호만 반영. */
  background?: string;
}

/** 카테고리별 신호(정규식). 매칭 수가 점수가 된다. 일상 대사에서도 자주 잡히도록 폭넓게. */
const SIGNALS: { expr: Exclude<Expression, '기본'>; re: RegExp }[] = [
  // 화남
  { expr: '화남', re: /화나|화났|화내|짜증|짜증나|미쳤|미쳐|미친|꺼져|닥쳐|닥치|죽여|죽을래|젠장|제기랄|시끄러|건방|감히|배신|분노|열받|빡쳐|그만해|그만 ?좀|왜 ?이래|어째서|거부|싫어|싫다|됐어|집어치|신경 ?꺼|어이없|진정 ?안|용서 ?안/ },
  // 슬픔
  { expr: '슬픔', re: /슬프|슬퍼|눈물|울었|울고|울지|울음|미안|죄송|아파|아프|외로|외롭|그리워|그립|보고 ?싶|이별|떠나|잃었|잃어|흐흑|훌쩍|절망|후회|우울|힘들|지쳐|지친|쓸쓸|한숨|에휴|에휴…|안타까|불쌍|괴로|서글|ㅠ|ㅜ/ },
  // 기쁨
  { expr: '기쁨', re: /기뻐|기쁘|행복|너무 ?좋|정말 ?좋|진짜 ?좋|좋아|좋다|좋네|좋은데|좋았|최고|대박|신나|신난|즐거|웃음|하하|헤헤|히히|ㅎㅎ|ㅋㅋ|야호|고마워|고맙|감사|사랑해|사랑한|설레|기대|반가|축하|다행|굿|행운|기분 ?좋/ },
  // 놀람
  { expr: '놀람', re: /헉|헐|뭐야|뭐라고|뭐\?|이럴 ?수|이게 ?무슨|설마|깜짝|놀라|놀랐|엥|어엇|믿을 ?수 ?없|말도 ?안|세상에|어떻게 ?이런|진짜\?|정말\?|으악|꺄악|우와|웬일|이런/ },
  // 수줍음
  { expr: '수줍음', re: /부끄|수줍|쑥스|두근|얼굴이 ?빨|발그|빨개|좋아한다|좋아해|사귀어|사귀자|사귈|고백|떨려|떨린|설레어|설렘/ },
];

/** 약한 보조 신호: 문장부호. 키워드가 우세하면 묻히지만, 무난한 문장에 약간의 생기를 준다. */
function punctuationHint(text: string): { expr: Exclude<Expression, '기본'>; weight: number } | null {
  const t = text.trim();
  if (/[!?]{2,}$|[?]!$|!\?$/.test(t)) return { expr: '놀람', weight: 0.5 }; // ?!, !!, ?? 류
  if (/\?\s*$/.test(t)) return { expr: '놀람', weight: 0.3 }; // 의문 → 약한 놀람/호기심
  if (/(…|\.\.\.)\s*$/.test(t)) return { expr: '슬픔', weight: 0.25 }; // 말끝 흐림 → 약한 가라앉음
  return null;
}

/** 배경 키워드의 강한 분위기 신호(있을 때만). */
function backgroundHint(bg: string | undefined): Exclude<Expression, '기본'> | null {
  if (!bg) return null;
  if (/장례|영안실|무덤|폐허|병실/.test(bg)) return '슬픔';
  if (/축제|파티|결혼|놀이공원|불꽃/.test(bg)) return '기쁨';
  return null;
}

/** 동점 시 우선순위(감정 변별력이 큰 순). */
const PRIORITY: Exclude<Expression, '기본'>[] = ['화남', '슬픔', '수줍음', '놀람', '기쁨'];

/**
 * 대사 + 맥락에서 표정을 추론한다. 신호가 없으면 '기본'.
 * 결정적(같은 입력 → 같은 출력)이라 스냅샷/검증에 안전하다.
 */
export function inferEmotion(text: string, ctx: EmotionContext = {}): Expression {
  const dir = (ctx.direction ?? []).join(' ');
  const hay = `${text} ${dir}`;

  const score = new Map<Exclude<Expression, '기본'>, number>();
  const bump = (e: Exclude<Expression, '기본'>, n: number) => score.set(e, (score.get(e) ?? 0) + n);

  for (const s of SIGNALS) if (s.re.test(hay)) bump(s.expr, 1);

  const ph = punctuationHint(text);
  if (ph) bump(ph.expr, ph.weight);

  const bh = backgroundHint(ctx.background);
  if (bh) bump(bh, 1.5); // 배경은 장면 전체 분위기라 강하게

  let best: Exclude<Expression, '기본'> | null = null;
  let bestScore = 0;
  for (const e of PRIORITY) {
    const v = score.get(e) ?? 0;
    if (v > bestScore) {
      best = e;
      bestScore = v;
    }
  }
  return best && bestScore > 0 ? best : '기본';
}
