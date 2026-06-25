// 텍스트/엑셀 파서가 공유하는 장면 누적기.
// 두 파서 모두 (화자, 본문) 형태의 "행"으로 정규화한 뒤 이 빌더에 흘려보낸다.

import type { Scene, Choice, Character, Expression } from '../types';

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
function splitJointSpeaker(raw: string): string[] {
  const parts = raw
    .split(/\s*[,&/·、＆]\s*/)
    .map((p) => p.replace(/\s*[(（].*$/, '').trim()) // 끝의 (표정) 태그 제거
    .filter(Boolean);
  return parts.length >= 2 ? parts : [];
}

/** 정규화된 한 행. speaker 가 있으면 대사, 없으면 본문(지문/태그)이다. */
export interface Row {
  speaker?: string;
  body: string;
}

export interface BuildResult {
  scenes: Scene[];
  characters: Character[];
}

export class SceneBuilder {
  private scenes: Scene[] = [];
  private speakers = new Set<string>();
  private current: Scene | null = null;

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
    const carryOutfits = this.current?.outfits;
    this.startScene(`${root} · ${label}`);
    if (carryBackground) this.current!.background = carryBackground;
    // 의상은 명시 변경 전까지 유지(분할 비트에 이어받음).
    if (carryOutfits) this.current!.outfits = { ...carryOutfits };
  }

  addDialogue(speaker: string, text: string, emotion?: string) {
    const sc = this.ensureScene();

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
    sc.lines.push({ kind: 'dialogue', speaker: name, text: text.trim(), emotion: valid });
  }

  addNarration(text: string) {
    const sc = this.ensureScene();
    sc.lines.push({ kind: 'narration', text: text.trim() });
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
      sc.bgm = v;
    }
  }
  /** #복장 "캐릭터:의상[, 캐릭터2:의상2]" — 이 장면에서 캐릭터별 의상을 지정. */
  setOutfit(spec: string) {
    const sc = this.ensureScene();
    const map = { ...(sc.outfits ?? {}) };
    for (const part of spec.split(',')) {
      const idx = part.search(/[:：]/);
      if (idx < 0) continue;
      const ch = part.slice(0, idx).trim();
      const outfit = part.slice(idx + 1).trim();
      if (ch && outfit) map[ch] = outfit;
    }
    sc.outfits = map;
  }
  addDirection(note: string) {
    this.ensureScene().direction.push(note.trim());
  }
  addCg(desc: string) {
    this.ensureScene().cg.push(desc.trim());
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
    return { scenes: this.scenes, characters };
  }
}

/**
 * 본문 한 줄에서 태그(#…) / 선택지(>) 를 해석해 빌더에 반영한다.
 * 어떤 태그도 아니면 false 를 반환(= 호출 측이 대사/지문으로 처리).
 */
export function applyTag(b: SceneBuilder, body: string): boolean {
  const t = body.trim();
  if (t.startsWith('#S ') || t === '#S' || t.startsWith('#장면')) {
    b.startScene(t.replace(/^#S\s*/, '').replace(/^#장면\s*/, ''));
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
