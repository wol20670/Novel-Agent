// 텍스트/엑셀 파서가 공유하는 장면 누적기.
// 두 파서 모두 (화자, 본문) 형태의 "행"으로 정규화한 뒤 이 빌더에 흘려보낸다.

import type { Scene, Choice, Character } from '../types';

const PALETTE = [
  '#9fd3ff', '#ffb3c7', '#c8ffc8', '#ffe5a3',
  '#d9b3ff', '#a3f0e0', '#ffc4a3', '#b3c4ff',
];

let counter = 0;
function uid(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter}`;
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

  addDialogue(speaker: string, text: string, emotion?: string) {
    const sc = this.ensureScene();
    const name = speaker.trim();
    this.speakers.add(name);
    sc.lines.push({ kind: 'dialogue', speaker: name, text: text.trim(), emotion });
  }

  addNarration(text: string) {
    const sc = this.ensureScene();
    sc.lines.push({ kind: 'narration', text: text.trim() });
  }

  setBackground(name: string) {
    this.ensureScene().background = name.trim();
  }
  setBgm(name: string) {
    this.ensureScene().bgm = name.trim();
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
    // 화자 → 캐릭터. 주인공으로 보이는 이름은 첫 색을 우선 배정.
    const names = [...this.speakers];
    const characters: Character[] = names.map((name, i) => ({
      name,
      color: PALETTE[i % PALETTE.length],
      expressions: {},
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
