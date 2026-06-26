// NovelAI 핵심 태그 사전(한국어 의미 → 영문 Danbooru 태그).
// 출처: 운영용 Google Sheet(사람이 편집하는 "원본"). 이 파일은 앱이 오프라인에서 읽는 "사본"이다.
//   - 시트를 직접 런타임 fetch 하지 않는 이유: CORS + 오프라인 동작 보장.
//   - 시트 갱신 → CSV 내보내기 → 이 배열만 교체(아래 구조 유지)하면 동기화 끝.
// 컴파일러(promptCompiler)는 이 사전을 gpt-4o-mini System Prompt 에 주입해
// "사전에 있는 의미는 반드시 사전 태그로 매칭, 없는 묘사만 직접 생성"하도록 강제한다.

export type TagCategory =
  | 'Clothing'
  | 'Accessory'
  | 'Background'
  | 'Lighting'
  | 'Effect'
  | 'Style'
  | 'Expression'
  | 'Camera'
  | 'Quality'
  | 'Subject';

export interface TagEntry {
  /** 한국어 의미(동의어 포함). 첫 항목이 대표 표기. */
  ko: string[];
  /** 영문 태그(쉼표로 복수 태그 가능). */
  en: string;
  cat: TagCategory;
}

// 개선한 표 구조(시트 권장): [한국어(동의어 / 구분) | 영문태그 | 카테고리] 단일 헤더 1줄.
// (기존 시트는 카테고리 블록마다 헤더가 반복돼 파싱이 어려웠음 → 카테고리는 한 열로 통합.)
export const TAG_DICTIONARY: TagEntry[] = [
  // Clothing
  { ko: ['교복', '세일러복'], en: 'school uniform, serafuku', cat: 'Clothing' },
  { ko: ['정장', '바지 정장'], en: 'business suit, pantsuit', cat: 'Clothing' },
  { ko: ['캐주얼 복장', '평상복'], en: 'casual wear', cat: 'Clothing' },
  { ko: ['드레스'], en: 'dress', cat: 'Clothing' },

  // Accessory
  { ko: ['안경'], en: 'glasses', cat: 'Accessory' },
  { ko: ['귀걸이'], en: 'earrings', cat: 'Accessory' },
  { ko: ['넥타이', '리본'], en: 'necktie, bowtie', cat: 'Accessory' },

  // Background
  { ko: ['단순한 배경', '심플 배경'], en: 'simple background', cat: 'Background' },
  { ko: ['흰색 배경', '흰 배경'], en: 'white background', cat: 'Background' },
  { ko: ['단색 배경'], en: 'monochrome background', cat: 'Background' },
  { ko: ['투명한 배경', '투명 배경'], en: 'transparent background', cat: 'Background' },

  // Lighting
  { ko: ['시네마틱 조명'], en: 'cinematic lighting', cat: 'Lighting' },
  { ko: ['역광'], en: 'backlight', cat: 'Lighting' },
  { ko: ['부드러운 조명'], en: 'soft lighting', cat: 'Lighting' },
  { ko: ['빛줄기', '광선'], en: 'light rays', cat: 'Lighting' },

  // Effect
  { ko: ['렌즈 플레어'], en: 'lens flare', cat: 'Effect' },
  { ko: ['피사계 심도', '배경 흐림', '아웃포커싱'], en: 'depth of field', cat: 'Effect' },
  { ko: ['입자 효과', '반짝임'], en: 'particle effects, sparkles', cat: 'Effect' },

  // Style
  { ko: ['다채로운 색감', '화려한 색감'], en: 'colorful', cat: 'Style' },

  // Expression
  { ko: ['미소 짓는', '미소'], en: 'smile', cat: 'Expression' },
  { ko: ['입을 벌린'], en: 'open mouth', cat: 'Expression' },
  { ko: ['부끄러워하는', '홍조', '볼 빨개짐'], en: 'blush', cat: 'Expression' },
  { ko: ['화난'], en: 'angry', cat: 'Expression' },
  { ko: ['슬픈', '우는'], en: 'crying, tears', cat: 'Expression' },
  { ko: ['무표정한', '무표정'], en: 'expressionless', cat: 'Expression' },
  { ko: ['윙크하는', '윙크'], en: 'wink', cat: 'Expression' },
  { ko: ['당황한', '땀방울'], en: 'sweatdrop', cat: 'Expression' },
  { ko: ['자신만만한', '의기양양한'], en: 'smug', cat: 'Expression' },

  // Camera
  { ko: ['전신'], en: 'full body', cat: 'Camera' },
  { ko: ['허벅지 위', '카우보이 샷'], en: 'cowboy shot', cat: 'Camera' },
  { ko: ['상반신'], en: 'upper body', cat: 'Camera' },
  { ko: ['얼굴 접사', '클로즈업'], en: 'close-up', cat: 'Camera' },
  { ko: ['정면을 보는', '정면 응시'], en: 'looking at viewer', cat: 'Camera' },
  { ko: ['위에서 아래로', '하이 앵글'], en: 'from above', cat: 'Camera' },
  { ko: ['아래서 위로', '로우 앵글'], en: 'from below', cat: 'Camera' },
  { ko: ['역동적인 구도', '다이내믹 앵글'], en: 'dynamic angle', cat: 'Camera' },

  // Quality
  { ko: ['최고 품질'], en: 'masterpiece', cat: 'Quality' },
  { ko: ['고품질'], en: 'best quality', cat: 'Quality' },
  { ko: ['매우 미적인'], en: 'very aesthetic', cat: 'Quality' },
  { ko: ['고해상도'], en: 'highres', cat: 'Quality' },
  { ko: ['섬세한 묘사'], en: 'highly detailed', cat: 'Quality' },
  { ko: ['터무니없는', '초고퀄'], en: 'absurdres', cat: 'Quality' },

  // Subject
  { ko: ['1명의 여성', '여성 1명'], en: '1girl', cat: 'Subject' },
  { ko: ['1명의 남성', '남성 1명'], en: '1boy', cat: 'Subject' },
];

/** 해당 카테고리만 골라 System Prompt 에 주입할 텍스트 블록으로 렌더링. */
export function dictionaryPromptBlock(cats: TagCategory[]): string {
  const lines: string[] = [];
  for (const cat of cats) {
    const rows = TAG_DICTIONARY.filter((e) => e.cat === cat);
    if (!rows.length) continue;
    lines.push(`[${cat}]`);
    for (const e of rows) lines.push(`${e.ko.join(' / ')} => ${e.en}`);
  }
  return lines.join('\n');
}

/** 사전에 등록된 모든 영문 태그(개별 단위, 소문자)의 집합 — 미등록 태그 판별용. */
export const DICTIONARY_EN_TAGS: Set<string> = new Set(
  TAG_DICTIONARY.flatMap((e) => e.en.split(',').map((t) => t.trim().toLowerCase())).filter(Boolean),
);

// 사전에 없어도 정상인 구조/범용 태그(미등록 후보로 잡지 않음).
const IGNORE_TAGS = new Set([
  'solo',
  '2girls',
  '2boys',
  'multiple girls',
  'multiple boys',
  'scenery',
  'no humans',
  'holding',
]);

const UNMATCHED_KEY = 'na_unmatched_tags';

/**
 * 미등록 단어 피드백 루프(선택): GPT 가 사전에 없이 새로 만든 태그를 빈도수와 함께 누적 저장한다.
 * 자주 등장하는 태그가 곧 사전에 추가하면 좋은 1순위 후보 → 관리자가 시트에 반영.
 */
export function recordUnmatchedTags(tags: string[]): void {
  if (typeof localStorage === 'undefined') return;
  let store: Record<string, number> = {};
  try {
    store = JSON.parse(localStorage.getItem(UNMATCHED_KEY) || '{}');
  } catch {
    store = {};
  }
  let changed = false;
  for (const raw of tags) {
    const t = raw.trim().toLowerCase();
    if (!t || t.includes('::') || DICTIONARY_EN_TAGS.has(t) || IGNORE_TAGS.has(t)) continue;
    store[t] = (store[t] || 0) + 1;
    changed = true;
  }
  if (changed) localStorage.setItem(UNMATCHED_KEY, JSON.stringify(store));
}

/** 미등록 태그를 빈도 내림차순으로 반환(콘솔/관리 UI 용). */
export function getUnmatchedTags(): Array<{ tag: string; count: number }> {
  if (typeof localStorage === 'undefined') return [];
  let store: Record<string, number> = {};
  try {
    store = JSON.parse(localStorage.getItem(UNMATCHED_KEY) || '{}');
  } catch {
    return [];
  }
  return Object.entries(store)
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
}

export function clearUnmatchedTags(): void {
  if (typeof localStorage !== 'undefined') localStorage.removeItem(UNMATCHED_KEY);
}
