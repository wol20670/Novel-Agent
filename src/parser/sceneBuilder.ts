// 텍스트/엑셀 파서가 공유하는 장면 누적기.
// 두 파서 모두 (화자, 본문) 형태의 "행"으로 정규화한 뒤 이 빌더에 흘려보낸다.

import type { Scene, Choice, Character, Expression, Locale, I18nText } from '../types';

/** "ko|en|ja" / "ko, en, ja" / "한국어 영어" → 유효 Locale 배열(중복·오탈자 제거). */
function parseLocaleSpec(raw: string): Locale[] {
  const alias: Record<string, Locale> = {
    ko: 'ko', kor: 'ko', korean: 'ko', 한국어: 'ko', 한글: 'ko',
    en: 'en', eng: 'en', english: 'en', 영어: 'en',
    ja: 'ja', jp: 'ja', jpn: 'ja', japanese: 'ja', 일본어: 'ja', 일어: 'ja',
  };
  const out: Locale[] = [];
  for (const tok of raw.split(/[|,/·、\s]+/)) {
    const k = tok.trim().toLowerCase();
    const loc = alias[k];
    if (loc && !out.includes(loc)) out.push(loc);
  }
  return out;
}

const PALETTE = [
  '#9fd3ff', '#ffb3c7', '#c8ffc8', '#ffe5a3',
  '#d9b3ff', '#a3f0e0', '#ffc4a3', '#b3c4ff',
];

/** 기본적으로 내레이션·대사 전용으로 보는 화자 이름(스프라이트 미생성). UI 에서 토글 가능. */
const PROTAGONIST_NAMES = new Set(['주인공', '나', '플레이어']);

let counter = 0;
function uid(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter}`;
}

/**
 * 합동 화자 분해: "한지수, 강민주" / "한지수 & 강민주" → ["한지수","강민주"].
 * 구분자(, & / · 、)가 없어 한 명이면 빈 배열을 돌려준다(= 일반 단일 화자).
 */
export function splitJointSpeaker(raw: string): string[] {
  const parts = raw
    .split(/\s*[,&/·、＆]\s*/)
    .map((p) => p.replace(/\s*[(（].*$/, '').trim()) // 끝의 (표정) 태그 제거
    .filter(Boolean);
  return parts.length >= 2 ? parts : [];
}

/** 번역 검수본 정리 — 각 값 trim, 빈 값 제거. 남는 게 없으면 undefined(라인에 i18n 미부착). */
function normalizeI18n(i18n?: I18nText): I18nText | undefined {
  if (!i18n) return undefined;
  const out: I18nText = {};
  for (const [loc, v] of Object.entries(i18n) as [Locale, string | undefined][]) {
    const t = (v ?? '').trim();
    if (t) out[loc] = t;
  }
  return Object.keys(out).length ? out : undefined;
}

/** 대본 메타태그(#설정_*)로 지정된 프로젝트 레벨 다국어 설정. 없는 값은 undefined(프로젝트 기본 유지). */
export interface ScriptMeta {
  baseLocale?: Locale;
  textLocales?: Locale[];
  voiceLocales?: Locale[];
}

export interface BuildResult {
  scenes: Scene[];
  characters: Character[];
  /** #설정_글언어 / #설정_목소리언어 로 지정된 값(있을 때만). store 가 프로젝트에 병합한다. */
  meta?: ScriptMeta;
}

export class SceneBuilder {
  private scenes: Scene[] = [];
  private speakers = new Set<string>();
  private current: Scene | null = null;
  private meta: ScriptMeta = {};
  /**
   * #인물숨김/#인물표시 가 장면 도중(이미 대사/지문이 나온 뒤)에 나오면, 그 값을 여기 잠깐 담아뒀다가
   * 다음에 push 되는 dialogue/narration 줄이 소비한다(setBgm 의 위치 마커와 같은 문제의식이지만,
   * hideSprites 는 UI 토글이 쓰는 값과 같은 필드라 마커 라인을 새로 만들지 않고 줄에 직접 얹는다).
   * 장면이 그대로 끝나거나 새 장면이 시작되면(startScene) 소비되지 못한 채 조용히 버려진다.
   */
  private pendingHide?: boolean;
  /**
   * #복장 이 장면 도중(이미 대사/지문이 나온 뒤)에 나오면 여기 모았다가 다음에 push 되는
   * dialogue/narration 줄이 소비한다(pendingHide 와 같은 관용구). 캐릭터별로 **머지**한다 —
   * 다음 줄 전에 #복장 이 여러 번 나오면 누적되고, 같은 캐릭터를 다시 적으면 마지막 값이 이긴다.
   * ⚠️ #아이템/#CG/#BGM 마커 라인은 이걸 소비하지 않는다(소비는 addDialogue/addNarration 두 곳뿐).
   */
  private pendingOutfits?: Record<string, string>;
  /**
   * 이 장면에서 지금까지 **소비된** 줄 전환의 누적 상태. 자동 분할(splitBeat)로 새 비트를 열 때
   * "시각적 연속성"을 위해 새 장면의 시작 의상(Scene.outfits)으로 접어 넣는다.
   * 배경 키워드 heuristic 의 결과는 여기 담지 않는다 — 그건 계속 resolveOutfit 이 판정한다.
   */
  private appliedOutfits: Record<string, string> = {};

  /** #S 가 나오기 전 본문이 들어오면 자동으로 도입 장면을 연다. */
  private ensureScene(): Scene {
    if (!this.current) {
      this.current = this.newScene('도입');
      this.scenes.push(this.current);
    }
    return this.current;
  }

  private newScene(title: string): Scene {
    return {
      id: uid('scene'),
      title: title.trim() || `장면 ${this.scenes.length + 1}`,
      direction: [],
      cg: [],
      lines: [],
      choices: [],
      status: 'review',
    };
  }

  startScene(title: string) {
    this.current = this.newScene(title);
    this.scenes.push(this.current);
    this.pendingHide = undefined; // 새 장면으로 넘어가면 이전 장면에서 못 쓴 예약값은 버린다.
    // 의상 줄 전환도 장면 경계에서 끊긴다(명시 #S 는 승계 없음 — 장면 독립성).
    // 자동 분할(splitBeat)만 예외로, startScene 을 부르기 **전에** 값을 스냅샷해 새 장면에 접어 넣는다.
    this.pendingOutfits = undefined;
    this.appliedOutfits = {};
  }

  /** 분할 장면의 표시 제목 루트(기존 " · 배경" 접미를 떼어 원 #S 제목만). */
  private rootTitle(t: string): string {
    const i = t.indexOf(' · ');
    return (i >= 0 ? t.slice(0, i) : t).trim();
  }

  /**
   * 한 장면 안에서 배경/BGM 이 "이미 무언가 보여준 뒤" 다시 바뀌면 새 비트로 자동 분할한다.
   * (데이터 모델은 장면당 배경·BGM 1개라, 분할하지 않으면 마지막 값만 남고 앞 배경이 사라진다.)
   * 분할 장면은 시각 연속성을 위해 직전 배경을 이어받고, 제목은 "원제목 · 새값" 으로 구분한다.
   */
  private splitBeat(label: string, carryBackground?: string) {
    const root = this.current ? this.rootTitle(this.current.title) : '장면';
    // startScene 이 줄 전환 상태를 리셋하므로 **호출 전에** 스냅샷을 뜬다. 새 비트의 시작 의상은
    // "장면 시작 의상 + 지금까지 소비된 줄 전환 + 아직 소비 안 된 예약분"을 이 순서로 덮은 값
    // (뒤가 이긴다) — 자동 분할은 시각적 연속이라 옷이 원상복귀하면 안 된다.
    const carryOutfits = {
      ...(this.current?.outfits ?? {}),
      ...this.appliedOutfits,
      ...(this.pendingOutfits ?? {}),
    };
    this.startScene(`${root} · ${label}`);
    if (carryBackground) this.current!.background = carryBackground;
    // 의상은 명시 변경 전까지 유지(분할 비트에 이어받음).
    if (Object.keys(carryOutfits).length) this.current!.outfits = carryOutfits;
  }

  /** pendingHide 를 한 번만 소비(읽고 비움) — dialogue/narration 두 갈래가 공유. */
  private consumePendingHide(): boolean | undefined {
    const v = this.pendingHide;
    this.pendingHide = undefined;
    return v;
  }

  /**
   * pendingOutfits 를 한 번만 소비(읽고 비움) — dialogue/narration 두 갈래가 공유.
   * 소비한 값은 appliedOutfits 에도 반영해 자동 분할 시 승계 대상이 되게 한다.
   */
  private consumePendingOutfits(): Record<string, string> | undefined {
    const v = this.pendingOutfits;
    this.pendingOutfits = undefined;
    if (!v) return undefined;
    this.appliedOutfits = { ...this.appliedOutfits, ...v };
    return v;
  }

  /** 이 장면에 이미 대사/지문이 나왔는지 — #복장 의 "장면 맨 앞" 판정 기준. */
  private hasSpokenLine(sc: Scene): boolean {
    return sc.lines.some((l) => l.kind === 'dialogue' || l.kind === 'narration');
  }

  addDialogue(speaker: string, text: string, emotion?: string, i18n?: I18nText) {
    const sc = this.ensureScene();
    const tr = normalizeI18n(i18n);
    const hideSprites = this.consumePendingHide();
    const outfits = this.consumePendingOutfits();

    // 합동 대사: "한지수, 강민주" / "한지수 & 강민주" 처럼 둘 이상이 동시에 말하는 줄.
    // 멤버(실제 등록 이름) 각각을 캐릭터로 등록하고, 표시 라벨은 " & " 로 묶는다(유령 캐릭터 없음).
    const members = splitJointSpeaker(speaker);
    if (members.length >= 2) {
      members.forEach((m) => this.speakers.add(m));
      sc.lines.push({
        kind: 'dialogue',
        speaker: members.join(' & '),
        text: text.trim(),
        members,
        i18n: tr,
        hideSprites,
        outfits,
      });
      return;
    }

    // "이름(표정)" 형태에서 표정 추출. 괄호는 반각/전각 모두 허용.
    let name = speaker.trim();
    let emo = emotion;
    const m = name.match(/^(.+?)\s*[(（]\s*(.+?)\s*[)）]\s*$/);
    if (m) {
      name = m[1].trim();
      emo = m[2].trim();
    }
    // 표정 이름은 자유 문자열(사용자 커스텀 가능) → 비어있지 않으면 그대로 채택(작가 신뢰).
    const valid: Expression | undefined = emo ? emo : undefined;
    this.speakers.add(name);
    sc.lines.push({ kind: 'dialogue', speaker: name, text: text.trim(), emotion: valid, i18n: tr, hideSprites, outfits });
  }

  addNarration(text: string, i18n?: I18nText) {
    const sc = this.ensureScene();
    sc.lines.push({
      kind: 'narration',
      text: text.trim(),
      i18n: normalizeI18n(i18n),
      hideSprites: this.consumePendingHide(),
      outfits: this.consumePendingOutfits(),
    });
  }

  /** #아이템 <이름> = 팝업 표시, #아이템끝 = 빈 이름(hide 마커). 라인 흐름 "그 위치"에 꽂힌다. */
  addItem(name: string) {
    this.ensureScene().lines.push({ kind: 'item', name: name.trim() });
  }

  /** #설정_글언어 — 자막 언어 목록. 첫 항목을 base(대본 원문)로 잡는다. */
  setTextLocales(spec: string) {
    const locs = parseLocaleSpec(spec);
    if (!locs.length) return;
    this.meta.baseLocale = locs[0];
    this.meta.textLocales = locs;
  }
  /** #설정_목소리언어 — 음성 언어 목록(자막과 독립). */
  setVoiceLocales(spec: string) {
    const locs = parseLocaleSpec(spec);
    if (locs.length) this.meta.voiceLocales = locs;
  }

  setBackground(name: string) {
    const sc = this.ensureScene();
    const v = name.trim();
    // 이미 대사/지문이 나온 장면에서 배경이 "다른 값"으로 바뀌면 새 비트로 분할.
    if (sc.background && sc.background !== v && sc.lines.length > 0) {
      this.splitBeat(v);
      this.current!.background = v;
    } else {
      sc.background = v;
    }
  }
  setBgm(name: string) {
    const sc = this.ensureScene();
    const v = name.trim();
    // BGM 이 장면 도중 다른 곡으로 바뀌면 분할(직전 배경은 이어받아 화면은 그대로 유지).
    if (sc.bgm && sc.bgm !== v && sc.lines.length > 0) {
      this.splitBeat(sc.background || v, sc.background);
      this.current!.bgm = v;
    } else {
      // 장면의 "첫" BGM 지정이면서 이미 나온 대사/지문이 있으면 태그가 나온 그 자리에 위치
      // 마커를 남긴다(generate.ts 가 거기서부터 play music 을 낸다). 장면 맨 앞(lines 0개)이면
      // 마커 없이 sc.bgm 만 채운다 — 기존과 완전히 같은 출력(장면 시작 재생, 회귀 0).
      if (!sc.bgm && sc.lines.length > 0) {
        sc.lines.push({ kind: 'bgm', name: v });
      }
      sc.bgm = v;
    }
  }
  /**
   * #복장 "캐릭터:의상[, 캐릭터2:의상2]" — 캐릭터별 의상 지정.
   * 위치에 따라 두 갈래다(setBgm 의 위치 마커와 같은 문제의식):
   *  · 장면 맨 앞(아직 대사/지문이 하나도 없음) → 장면 시작 의상 sc.outfits 에 머지(기존 동작).
   *  · 장면 도중                                → pendingOutfits 에 머지 → 다음 대사/지문 줄이
   *    소비해 Line.outfits 로 얹힌다(= 그 줄부터 갈아입는다).
   * ⚠️ 판정 기준이 setBgm/setHideSprites 의 `lines.length` 와 다른 이유: #아이템·#CG·#BGM 은
   * 마커 라인을 push 하므로 lines.length 로 재면 "#CG → #복장 → 첫 대사" 가 줄 전환으로 잘못
   * 분류돼 기존 대본의 출력이 바뀐다. 여기만 "대사/지문이 나왔는지"로 잰다(다른 태그는 무변경).
   */
  setOutfit(spec: string) {
    const sc = this.ensureScene();
    const parsed: Record<string, string> = {};
    for (const part of spec.split(',')) {
      const idx = part.search(/[:：]/);
      if (idx < 0) continue;
      const ch = part.slice(0, idx).trim();
      const outfit = part.slice(idx + 1).trim();
      if (ch && outfit) parsed[ch] = outfit;
    }
    if (this.hasSpokenLine(sc)) {
      this.pendingOutfits = { ...(this.pendingOutfits ?? {}), ...parsed };
    } else {
      sc.outfits = { ...(sc.outfits ?? {}), ...parsed };
    }
  }
  /**
   * #인물숨김/#인물표시 — setBgm 과 같은 규칙: 장면 맨 앞(아직 대사/지문 없음)이면 장면 시작 상태
   * (sc.hideSprites)로 바로 반영, 도중이면 다음에 push 되는 dialogue/narration 줄에 얹는다
   * (pendingHide, consumePendingHide 가 소비). 장면이 그대로 끝나면 조용히 버려진다.
   */
  setHideSprites(hide: boolean) {
    const sc = this.ensureScene();
    if (sc.lines.length === 0) {
      sc.hideSprites = hide;
    } else {
      this.pendingHide = hide;
    }
  }
  addDirection(note: string) {
    this.ensureScene().direction.push(note.trim());
  }
  /** #CG <설명> — 에셋 목록(scene.cg)에 등록하고, 라인 흐름 "그 위치"에 배경 전환 마커도 꽂는다. */
  addCg(desc: string) {
    const sc = this.ensureScene();
    const v = desc.trim();
    sc.cg.push(v);
    sc.lines.push({ kind: 'cg', desc: v });
  }
  addChoice(choice: Choice) {
    this.ensureScene().choices.push(choice);
  }
  setJump(target: string) {
    this.ensureScene().jumpTo = target.trim();
  }

  finish(): BuildResult {
    // 화자 → 캐릭터. "주인공" 류는 내레이션·대사 전용으로 표시(스프라이트 미생성).
    const names = [...this.speakers];
    const characters: Character[] = names.map((name, i) => ({
      name,
      color: PALETTE[i % PALETTE.length],
      expressions: {},
      isProtagonist: PROTAGONIST_NAMES.has(name),
    }));
    const meta = Object.keys(this.meta).length ? this.meta : undefined;
    return { scenes: this.scenes, characters, meta };
  }
}

/** 필드형 태그 (장면:/배경:/BGM: ...) 정규식 — 텍스트·엑셀 파서가 공유. */
const FIELD = /^(장면|배경|BGM|복장|연출|CG|점프|글언어|목소리언어)\s*[:：]\s*(.*)$/i;

const FIELD_TAG_MAP: Record<string, string> = {
  '장면': '#S ',
  '배경': '#배경 ',
  bgm: '#BGM ',
  '복장': '#복장 ',
  '연출': '#연출 ',
  cg: '#CG ',
  '점프': '#점프 ',
  '글언어': '#설정_글언어 ',
  '목소리언어': '#설정_목소리언어 ',
};

/**
 * "장면: 교실" 같은 필드형(콜론) 태그 한 줄을 '#…' 태그 문자열로 변환한다(텍스트·엑셀 공용).
 * 필드형이 아니면 null — 호출 측이 다른 방식(원시 # 태그·대사·지문)으로 처리.
 */
export function fieldToTag(line: string): string | null {
  const m = line.match(FIELD);
  if (!m) return null;
  const key = m[1].toLowerCase();
  const val = m[2];
  // 알 수 없는 key 는 발생하지 않는다(정규식이 key 를 열거) — 단순 매핑으로 충분.
  return (FIELD_TAG_MAP[key] ?? '#') + val;
}

/**
 * 본문 한 줄에서 태그(#…) / 선택지(>) 를 해석해 빌더에 반영한다.
 * 어떤 태그도 아니면 false 를 반환(= 호출 측이 대사/지문으로 처리).
 */
export function applyTag(b: SceneBuilder, body: string): boolean {
  const t = body.trim();
  if (/^#s(\s|$)/i.test(t) || t.startsWith('#장면')) {
    b.startScene(t.replace(/^#S\s*/i, '').replace(/^#장면\s*/, ''));
    return true;
  }
  // 프로젝트 레벨 다국어 설정(장면 무관, 대본 어디에 있어도 됨).
  if (t.startsWith('#설정_글언어')) {
    b.setTextLocales(t.replace(/^#설정_글언어\s*[:：]?\s*/, ''));
    return true;
  }
  if (t.startsWith('#설정_목소리언어')) {
    b.setVoiceLocales(t.replace(/^#설정_목소리언어\s*[:：]?\s*/, ''));
    return true;
  }
  if (t.startsWith('#배경')) {
    b.setBackground(t.replace(/^#배경\s*/, ''));
    return true;
  }
  if (/^#BGM/i.test(t)) {
    b.setBgm(t.replace(/^#BGM\s*/i, ''));
    return true;
  }
  if (t.startsWith('#복장')) {
    b.setOutfit(t.replace(/^#복장\s*/, ''));
    return true;
  }
  // 인물(스프라이트) 숨김 — #CG 와 달리 배경은 그대로 두고 인물만 숨기며, 되돌릴 수 있다.
  // 표시 쪽은 #인물표시/#인물등장 둘 다 받는다(둘 다 자연스러운 표기라 별칭 처리).
  if (t.startsWith('#인물숨김')) {
    b.setHideSprites(true);
    return true;
  }
  if (t.startsWith('#인물표시') || t.startsWith('#인물등장')) {
    b.setHideSprites(false);
    return true;
  }
  // 아이템(소품) 팝업. #아이템끝(닫기)을 #아이템보다 먼저 매칭한다.
  if (t.startsWith('#아이템끝') || t.startsWith('#소품끝')) {
    b.addItem('');
    return true;
  }
  if (t.startsWith('#아이템') || t.startsWith('#소품')) {
    b.addItem(t.replace(/^#(아이템|소품)\s*/, ''));
    return true;
  }
  if (t.startsWith('#연출')) {
    b.addDirection(t.replace(/^#연출\s*/, ''));
    return true;
  }
  if (t.startsWith('#CG')) {
    b.addCg(t.replace(/^#CG\s*/, ''));
    return true;
  }
  if (t.startsWith('#점프')) {
    b.setJump(t.replace(/^#점프\s*/, ''));
    return true;
  }
  // 이 장면에서 이야기를 끝맺음(분기 엔딩). 다음 라벨로 새지 않도록 종료로 점프.
  if (t === '#끝' || t.startsWith('#끝') || /^#(END|end)\b/.test(t)) {
    b.setJump('끝');
    return true;
  }
  if (t.startsWith('>')) {
    const raw = t.replace(/^>\s*/, '');
    const [label, target] = raw.split('->').map((s) => s.trim());
    b.addChoice({ text: label, target: target || undefined });
    return true;
  }
  // 알 수 없는 # 태그는 무시(오타 방지용으로 흡수하지 않고 false 반환).
  if (t.startsWith('#')) {
    b.addDirection(t.replace(/^#\s*/, '')); // 보수적으로 연출 노트로 흡수
    return true;
  }
  return false;
}
