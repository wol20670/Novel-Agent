// 승인된 장면들로 Ren'Py 프로젝트 파일 집합을 생성한다.
// 파일 본문(텍스트)만 만들고, 바이너리 에셋(PNG/WAV)은 zip 빌더가 채운다.

import type { Project, Scene, Line, Character, Expression } from '../types';
import { RENPY_LANG, LOCALE_LABEL, baseLocaleOf, effectiveTextLocales, effectiveVoiceLocales } from '../types';
import { SlugMap } from './slug';
import { generateGuiFiles, resolveTheme, withGuiOverrides } from './gui';
import { CONFIRM_STRINGS, UI_STRINGS, uiTr } from './gui/uiStrings';
import { inferEmotion } from '../generators/emotion';
import { enforceContrast } from '../generators/theme/color';

export interface RenpyFile {
  path: string; // game/ 이하 경로
  content: string;
}

/**
 * Ren'Py 참조용 결정적 base 이름(언어·확장자 없음). vo("...") 와 buildZip 이 채우는 실제 음성
 * 파일 경로가 이 함수 하나를 공유해야 어긋나지 않는다(export 해서 zip/buildZip.ts 가 재사용).
 */
export function voiceBaseName(charId: string, sceneLabel: string, lineIdx: number): string {
  return `${charId}_${sceneLabel}_${String(lineIdx).padStart(3, '0')}`;
}

/**
 * 오디오 blob 의 실제 MIME → 확장자. 성우 음성은 TTS 생성(Supertone, mp3 요청)뿐 아니라 사용자가
 * "📁 파일로 적용"으로 임의 포맷(wav 등)을 올릴 수도 있어, BGM 처럼 확장자를 mp3 로 무조건 고정하면
 * 안 됨(고정하면 Ren'Py 가 다른 포맷 바이트를 mp3 로 잘못 디코드 시도해 무음/오류가 날 수 있음).
 * 알 수 없는 타입은 mp3 로 폴백(기존 동작 유지, Supertone 기본 요청 포맷).
 */
export function extFromMime(mime: string | undefined): 'mp3' | 'wav' {
  return mime?.includes('wav') ? 'wav' : 'mp3';
}

/** 한글 표정 → Ren'Py 이미지 속성(ASCII). 이미지 attribute 는 ASCII 가 안전. */
export const EXPR_ATTR: Record<Expression, string> = {
  기본: 'neutral',
  기쁨: 'happy',
  슬픔: 'sad',
  화남: 'angry',
  놀람: 'surprised',
  수줍음: 'shy',
};

/** 임의 문자열 → 짧은 ASCII 슬러그(커스텀 표정/의상 이름의 Ren'Py 속성 충돌 방지). */
function asciiSlug(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/** 표정 → Ren'Py 속성. 알려진 표정은 고정 매핑, 커스텀은 충돌 없는 슬러그. */
export function attrFor(expr: Expression): string {
  return EXPR_ATTR[expr] ?? `x${asciiSlug(expr)}`;
}

/** 의상 → Ren'Py 속성. '기본'은 base, 나머지는 슬러그. */
export function outfitAttrFor(outfit: string): string {
  return outfit === '기본' ? 'base' : `o${asciiSlug(outfit)}`;
}

export interface SpriteRef {
  charId: string; // c_1 …
  charName: string;
  expr: Expression;
  attr: string; // neutral/happy/…
  /** 의상 이름('기본' 포함). */
  outfit: string;
  /** 의상 Ren'Py 속성(base/o…). */
  outfitAttr: string;
  file: string; // sprite_c_1_base_happy.png
  /** 사용자가 생성/업로드한 스프라이트. 없으면(자동 표정 슬롯) 빌더가 Canvas/AI 로 채운다. */
  assetId?: string;
}

/**
 * 대사 줄의 "유효 표정" — 명시 태그가 있으면 그대로, 없으면 문맥에서 추론.
 * 이미지 API 연동 후에는 검수 단계에서 line.emotion 을 미리 채워두면 그 값이 우선한다.
 */
export function effectiveEmotion(line: Line, scene: Scene): Expression {
  if (line.kind !== 'dialogue') return '기본';
  return (
    (line.emotion as Expression | undefined) ??
    inferEmotion(line.text, { direction: scene.direction, background: scene.background })
  );
}

/** 캐릭터별로 (인페어런스 포함) 대본에서 실제 쓰이는 표정 집합. 이미지 API 생성 대상 목록이기도 하다. */
export function expressionPlan(project: Project, ids: Map<string, string>): Map<string, Set<Expression>> {
  const plan = new Map<string, Set<Expression>>();
  for (const scene of project.scenes) {
    if (scene.status !== 'approved') continue;
    for (const line of scene.lines) {
      if (line.kind !== 'dialogue') continue;
      const emo = effectiveEmotion(line, scene);
      for (const id of lineSpeakerIds(line, ids)) {
        const set = plan.get(id) ?? plan.set(id, new Set<Expression>()).get(id)!;
        set.add(emo);
      }
    }
  }
  return plan;
}

/** 캐릭터 이름 → 안정적 Ren'Py 식별자. project.characters 순서로 발급(스프라이트와 공유). */
export function charIdMap(project: Project): Map<string, string> {
  const slug = new SlugMap('c');
  const m = new Map<string, string>();
  for (const c of project.characters) m.set(c.name, slug.get(c.name));
  return m;
}

/** 한 대사 줄을 "화면에 세울 화자 id 목록" 으로. 합동 대사면 멤버 전원, 아니면 화자 1명. */
export function lineSpeakerIds(line: Line, ids: Map<string, string>): string[] {
  if (line.kind !== 'dialogue') return [];
  if (line.members && line.members.length) {
    return line.members.map((m) => ids.get(m)).filter((x): x is string => !!x);
  }
  const id = ids.get(line.speaker);
  return id ? [id] : [];
}

/** 합동 대사 화자(둘 이상 동시) — 이름표 묶음용 Character. 멤버는 실제 캐릭터를 그대로 공유한다. */
export interface JointSpeaker {
  id: string; // cj_1 …
  label: string; // "한지수 & 강민주"
  members: string[];
  color: string;
}

/** 승인 장면에 등장하는 합동 대사 라벨 → JointSpeaker. 같은 라벨은 한 번만 정의된다. */
export function resolveJointSpeakers(project: Project): Map<string, JointSpeaker> {
  const slug = new SlugMap('cj');
  const colorByName = new Map(project.characters.map((c) => [c.name, c.color]));
  const out = new Map<string, JointSpeaker>();
  for (const scene of project.scenes) {
    if (scene.status !== 'approved') continue;
    for (const line of scene.lines) {
      if (line.kind !== 'dialogue' || !line.members || line.members.length < 2) continue;
      if (out.has(line.speaker)) continue;
      out.set(line.speaker, {
        id: slug.get(line.speaker),
        label: line.speaker,
        members: line.members,
        color: colorByName.get(line.members[0]) ?? '#ffffff',
      });
    }
  }
  return out;
}

/**
 * 캐릭터 스프라이트 ref 목록.
 * 스프라이트를 하나라도 설정한(opt-in) 캐릭터는 대본에서 쓰이는 모든 표정 슬롯을 갖는다
 * → 대사에 따라 표정이 자동 전환된다(미설정 표정은 빌더가 Canvas/AI 로 채움).
 * 스프라이트를 전혀 설정하지 않은 캐릭터는 화면에 세우지 않는다(대사만).
 */
export function resolveSprites(
  project: Project,
  ids: Map<string, string>,
  plan: Map<string, Set<Expression>> = expressionPlan(project, ids),
): SpriteRef[] {
  const out: SpriteRef[] = [];
  for (const c of project.characters) {
    const charId = ids.get(c.name);
    if (!charId) continue;
    if (c.isProtagonist) continue; // 내레이션·대사 전용(주인공) — 화면에 세우지 않음

    const stored = c.expressions;
    const optedIn = Object.values(stored).some(Boolean);
    if (!optedIn) continue; // 스프라이트 미사용 캐릭터

    // 기본 의상: 저장된 표정 + 대본에서 쓰인 표정(자동) + 기본(베이스라인).
    const baseExprs = new Set<Expression>([
      ...(Object.keys(stored) as Expression[]).filter((e) => stored[e]),
      ...(plan.get(charId) ?? []),
      '기본',
    ]);
    for (const expr of baseExprs) {
      const attr = attrFor(expr);
      out.push({
        charId,
        charName: c.name,
        expr,
        attr,
        outfit: '기본',
        outfitAttr: 'base',
        file: `sprite_${charId}_base_${attr}.png`,
        assetId: stored[expr],
      });
    }

    // 추가 의상: 실제 생성된 스프라이트가 있는 표정만 정의(없는 표정은 show 시 기본 의상으로 폴백).
    for (const o of c.outfits ?? []) {
      const oAttr = outfitAttrFor(o.name);
      const oExprs = (Object.keys(o.expressions) as Expression[]).filter((e) => o.expressions[e]);
      for (const expr of oExprs) {
        const attr = attrFor(expr);
        out.push({
          charId,
          charName: c.name,
          expr,
          attr,
          outfit: o.name,
          outfitAttr: oAttr,
          file: `sprite_${charId}_${oAttr}_${attr}.png`,
          assetId: o.expressions[expr],
        });
      }
    }
  }
  return out;
}

/** 승인 장면의 에셋 참조. 배경/BGM/CG 는 "이름(의미)" 기준으로 공유된다(같은 이름 = 같은 파일). */
export interface SceneAssetRef {
  scene: Scene;
  ordinal: number; // 1-based, 승인 장면 순서
  label: string; // scene_1 (장면은 고유)
  bgTag: string; // 배경 이미지 태그 — 같은 배경 이름이면 동일 (bg_1)
  bgFile: string; // bg_1.png
  bgmFile?: string; // bgm_1.mp3 (업로드본이 있을 때만, 같은 BGM 이름이면 동일)
  cgTags: string[]; // 같은 CG 설명이면 동일
  cgFiles: string[];
}

/** 에셋 공유 키 — 같은 키를 가진 장면들은 같은 배경/BGM/CG 파일을 공유한다. */
export function backgroundKey(s: Scene): string {
  return (s.background || s.title).trim();
}
export function bgmKey(s: Scene): string {
  return (s.bgm || s.title).trim();
}
export function hasBgm(s: Scene): boolean {
  return !!(s.bgm || s.bgmAssetId);
}

/** 아이템(소품) 팝업 참조 — 이름 기준 공유(같은 이름 = 같은 이미지 1장). */
export interface ItemRef {
  name: string;
  tag: string; // item_1 … (Ren'Py image 이름이자 persistent.item_found 키)
  file: string; // item_1.png
  assetId?: string;
}

/** 승인 장면들의 `#아이템 <이름>` 을 이름 기준으로 유니크 수집(등장 순서). */
export function resolveItems(project: Project): ItemRef[] {
  const slugs = new SlugMap('item');
  const seen = new Map<string, ItemRef>();
  for (const scene of project.scenes) {
    if (scene.status !== 'approved') continue;
    for (const line of scene.lines) {
      if (line.kind !== 'item') continue;
      const name = line.name.trim();
      if (!name || seen.has(name)) continue;
      const tag = slugs.get(name);
      seen.set(name, { name, tag, file: `${tag}.png`, assetId: project.itemAssetIds?.[name] });
    }
  }
  return [...seen.values()];
}

const indent = (n: number) => '    '.repeat(n);

function esc(s: string): string {
  // %(변수)s 같은 보간 문법이 아닌 순수 문자(예: "할인 20%")는 %% 로 이스케이프해야 한다.
  // 안 하면 Ren'Py 가 그 줄을 표시할 때 "Unknown string format code" 로 런타임에 죽는다(실제 SDK로 확인).
  // [ ] 는 변수 보간, { } 는 텍스트 태그로 해석되므로(예: 사용자가 "[속보]"·"{웃음}" 을 입력) 동일하게
  // 무력화해야 한다 — 안 하면 NameError/Unknown text tag 로 런타임에 죽는다(escRpyText 와 동일 갭).
  return s
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\[/g, '[[')
    .replace(/\{/g, '{{')
    .replace(/%/g, '%%')
    .replace(/\n/g, ' ')
    .trim();
}

/**
 * 승인 장면 + 에셋 이름을 계산. 배경/BGM/CG 태그는 "이름" 기준 SlugMap 으로 발급되어
 * 같은 이름을 쓰는 여러 장면이 **같은 파일을 공유**한다(생성 1회 + 시각 일관성).
 * zip 빌더가 동일 함수로 파일명을 안다.
 */
export function resolveSceneAssets(project: Project): SceneAssetRef[] {
  const approved = project.scenes.filter((s) => s.status === 'approved');
  const bgSlugs = new SlugMap('bg');
  const bgmSlugs = new SlugMap('bgm');
  const cgSlugs = new SlugMap('cg');
  return approved.map((scene, i) => {
    const ordinal = i + 1;
    const bgTag = bgSlugs.get(backgroundKey(scene));
    // 배경은 항상 Canvas 폴백이 채우지만 BGM 은 이제 업로드본이 없으면 파일이 없다 — 이름만
    // 있고(#BGM) 실제 오디오를 업로드하지 않은 장면은 `play music` 자체를 방출하지 않는다
    // (Ren'Py 는 없는 파일을 참조하면 런타임 에러이므로, 여기서 assetId 유무로 게이팅한다).
    const bgmTag = scene.bgmAssetId ? bgmSlugs.get(bgmKey(scene)) : undefined;
    const cgTags = scene.cg.map((desc) => cgSlugs.get(desc.trim() || `${scene.title}_cg`));
    return {
      scene,
      ordinal,
      label: `scene_${ordinal}`,
      bgTag,
      bgFile: `${bgTag}.png`,
      // Suno 등에서 받는 BGM 은 대부분 mp3 — Ren'Py music 채널은 mp3 를 그대로 재생한다(WAV 변환 없음).
      bgmFile: bgmTag ? `${bgmTag}.mp3` : undefined,
      cgTags,
      cgFiles: cgTags.map((t) => `${t}.png`),
    };
  });
}

/** 제목 → 라벨 해석. 동명 장면은 "현재 이후 첫 매치, 없으면 전체 첫 매치". */
function makeResolver(refs: SceneAssetRef[]) {
  return (title: string | undefined, fromOrdinal: number): string | undefined => {
    if (!title) return undefined;
    const t = title.trim();
    // 예약어: 이야기 종료 라벨로 점프(분기 엔딩이 다음 장면으로 새는 것을 막음).
    if (t === '끝' || t === '_vn_end' || /^(end)$/i.test(t)) return '_vn_end';
    const matches = refs.filter((r) => r.scene.title.trim() === title.trim());
    if (matches.length === 0) return undefined;
    const after = matches.find((m) => m.ordinal > fromOrdinal);
    return (after ?? matches[0]).label;
  };
}

function characterDefs(
  project: Project,
  ids: Map<string, string>,
  joints: Map<string, JointSpeaker>,
  dialogueBox: string,
): string {
  // 이름표 색은 캐릭터 고유색을 쓰되, 대사창 배경 대비 읽히도록 보정(어두운 창=밝게/밝은 창=어둡게).
  const nameColor = (hue: string) => enforceContrast(hue, dialogueBox, 4.5);
  const lines = ['# 자동 생성: 캐릭터 정의', ''];
  for (const c of project.characters) {
    // _() 로 감싸야 translationFiles() 가 내보내는 이름표 번역(old/new)이 자막 언어 전환 시 적용된다
    // (define 은 init 시 1회 실행이라, 감싸지 않으면 언어를 바꿔도 이름표는 원문에 고정됨).
    lines.push(`define ${ids.get(c.name)} = Character(_("${esc(c.name)}"), color="${nameColor(c.color)}")`);
  }
  if (project.characters.length === 0) lines.push('# (등장 캐릭터 없음)');
  if (joints.size) {
    lines.push('', '# 합동 대사 화자(둘 이상 동시) — 이름표만 묶음, 스프라이트는 멤버 각자');
    for (const j of joints.values()) {
      lines.push(`define ${j.id} = Character("${esc(j.label)}", color="${nameColor(j.color)}")`);
    }
  }
  return lines.join('\n') + '\n';
}

function assetDefs(refs: SceneAssetRef[], sprites: SpriteRef[], items: ItemRef[]): string {
  const lines = ['# 자동 생성: 이미지·오디오 에셋 정의', ''];
  // 공유 태그는 1회만 정의(같은 이름 배경/CG 가 여러 장면에 쓰여도 image 선언은 하나).
  const seen = new Set<string>();
  for (const r of refs) {
    if (!seen.has(r.bgTag)) {
      seen.add(r.bgTag);
      lines.push(`image ${r.bgTag} = "images/${r.bgFile}"`);
    }
    r.cgTags.forEach((tag, j) => {
      if (seen.has(tag)) return;
      seen.add(tag);
      lines.push(`image ${tag} = "images/${r.cgFiles[j]}"`);
      // CG 배경 합성판: 뒤 = cover+blur 확대(여백 채움), 앞 = contain 원본. scene 문으로 배경 교체에 쓴다.
      // (transform 문은 init 0, image 문은 init 500 에 실행되므로 파일이 달라도 참조 순서는 안전.)
      lines.push(
        `image ${tag}_scene = Fixed(At("images/${r.cgFiles[j]}", vn_cg_backdrop), At("images/${r.cgFiles[j]}", vn_cg_fit))`,
      );
    });
  }
  if (sprites.length) {
    lines.push('', '# 캐릭터 스프라이트 (속성: <의상> <표정>)');
    for (const sp of sprites) {
      lines.push(`image ${sp.charId} ${sp.outfitAttr} ${sp.attr} = "images/${sp.file}"`);
    }
  }
  if (items.length) {
    lines.push('', '# 아이템(소품) 팝업 이미지 (투명 컷아웃)');
    for (const it of items) lines.push(`image ${it.tag} = "images/${it.file}"`);
  }
  return lines.join('\n') + '\n';
}

/**
 * N명을 가로 0~100 스케일로 배치한 중심 좌표(%).
 * 1명=가운데(50), 2명=35·70, 3명+=균등 분배.
 */
export function spreadPositions(n: number): number[] {
  if (n <= 1) return [50];
  if (n === 2) return [30, 70]; // 좌·우 대칭(양끝에서 30)
  return Array.from({ length: n }, (_, i) => Math.round(((i + 0.5) / n) * 100));
}

/**
 * "지금까지 등장한(스프라이트 보유) 캐릭터" 목록을 가로 위치(%)로 배정.
 * 혼자면 side 와 무관하게 항상 중앙. 2인 이상이면 side='left'/'right' 고정 캐릭터를 각 끝
 * 슬롯부터, 'auto'(미지정 포함)는 남는 가운데 슬롯을 등장 순서대로 채운다(같은 side끼리는
 * 등장 순서로 tie-break — 먼저 등장이 더 바깥쪽). scriptBody 가 장면 안에서 새 캐릭터가 등장할
 * 때마다(점진적으로 커지는 order 로) 다시 호출해, 혼자일 땐 중앙 → 2번째 등장 시 고정 위치로
 * 스냅 이동하는 게 자연히 성립한다.
 */
function arrangePositions(
  order: string[],
  sideById: Map<string, 'left' | 'right' | 'auto'>,
): Map<string, number> {
  const xs = spreadPositions(order.length);
  const pos = new Map<string, number>();
  if (order.length <= 1) {
    order.forEach((id, i) => pos.set(id, xs[i] ?? 50));
    return pos;
  }
  const sideOf = (id: string) => sideById.get(id) ?? 'auto';
  const lefts = order.filter((id) => sideOf(id) === 'left');
  const rights = order.filter((id) => sideOf(id) === 'right');
  const autos = order.filter((id) => sideOf(id) === 'auto');
  const arranged = [...lefts, ...autos, ...rights];
  arranged.forEach((id, i) => pos.set(id, xs[i] ?? 50));
  return pos;
}

function scriptBody(
  refs: SceneAssetRef[],
  ids: Map<string, string>,
  sprites: SpriteRef[],
  transition: string,
  joints: Map<string, JointSpeaker>,
  screenH: number,
  items: ItemRef[],
  sideById: Map<string, 'left' | 'right' | 'auto'>,
): string {
  const resolve = makeResolver(refs);
  const itemTag = new Map(items.map((it) => [it.name, it.tag]));
  const spritesByChar = new Map<string, SpriteRef[]>();
  for (const sp of sprites) {
    (spritesByChar.get(sp.charId) ?? spritesByChar.set(sp.charId, []).get(sp.charId)!).push(sp);
  }
  // 캐릭터 키 높이 = 화면의 90%(머리 잘림 방지). 원본 해상도 무관하게 fit 으로 정규화.
  const charH = Math.round(screenH * 0.9);
  const out: string[] = [];
  out.push('# 자동 생성: 메인 스크립트', '');
  // 캐릭터 배치·크기 transform — xpct(0~100) 중심, 바닥 정렬, 화면 높이에 맞춰 스케일.
  out.push('# 캐릭터 배치: 가로 0~100 중심 좌표, 바닥 정렬, 화면 높이 90%로 스케일(어떤 해상도 이미지든 자동 맞춤)');
  out.push('transform vn_char(xpct=50.0):');
  out.push(`${indent(1)}fit "contain"`);
  out.push(`${indent(1)}ysize ${charH}`);
  out.push(`${indent(1)}xanchor 0.5 yanchor 1.0`);
  out.push(`${indent(1)}xpos (xpct / 100.0) ypos 1.0`);
  out.push('');
  // 배경: 화면 전체를 채우도록 fit cover(레터박스 0). NovelAI 가로 출력은 1216×832(3:2)라
  // 16:9 게임에선 위아래가 다소 잘리지만(비율 유지·왜곡 없음), 검은 띠·여백 없이 꽉 찬다.
  out.push('# 배경: 어떤 해상도/비율 이미지든 화면을 꽉 채움(fit cover, 비율 유지·가장자리 크롭)');
  out.push('transform vn_bg:');
  out.push(`${indent(1)}fit "cover"`);
  out.push(`${indent(1)}xysize (config.screen_width, config.screen_height)`);
  out.push(`${indent(1)}align (0.5, 0.5)`);
  out.push('');
  // CG(이벤트 일러스트): 그 지점부터 장면 "배경"으로 쓴다(스프라이트는 scene 문이 지움).
  // 원본은 fit contain(비율 유지·잘림 없음 — 화면보다 큰 CG의 머리 잘림이 실사용 버그였음),
  // 비율이 달라 생기는 여백은 같은 CG를 cover+blur 로 확대해 깔아 채운다(블러 백드롭).
  // blur 는 GL2 렌더러(Ren'Py 7.4+) 속성 — assetDefs 의 <tag>_scene 합성 이미지가 이 둘을 겹친다.
  out.push('# CG 배경: 뒤판 = cover+blur 확대(여백 채움), 앞판 = contain 원본(잘림 없음)');
  out.push('transform vn_cg_backdrop:');
  out.push(`${indent(1)}fit "cover"`);
  out.push(`${indent(1)}xysize (config.screen_width, config.screen_height)`);
  out.push(`${indent(1)}align (0.5, 0.5)`);
  out.push(`${indent(1)}blur 24`);
  out.push('transform vn_cg_fit:');
  out.push(`${indent(1)}fit "contain"`);
  out.push(`${indent(1)}xysize (config.screen_width, config.screen_height)`);
  out.push(`${indent(1)}align (0.5, 0.5)`);
  out.push('');
  out.push('label start:');
  if (refs.length > 0) out.push(`    jump ${refs[0].label}`);
  else out.push('    "승인된 장면이 없습니다."', '    return');
  out.push('');

  for (const r of refs) {
    const s = r.scene;
    // 장면 안에서 새 캐릭터가 등장할 때마다 점진적으로 커지는 상태(장면마다 리셋) — 혼자일 땐
    // 중앙, 2번째가 등장하는 순간 arrangePositions 로 다시 배치해 이미 서 있던 캐릭터도 스냅 이동.
    const revealedOrder: string[] = [];
    let currentPos = new Map<string, number>();
    out.push(`# ── ${s.title} ──`);
    out.push(`label ${r.label}:`);
    out.push(`${indent(1)}scene ${r.bgTag} at vn_bg with ${transition}`);
    if (r.bgmFile) out.push(`${indent(1)}play music "audio/${r.bgmFile}" fadein 1.0`);
    // CG 배경 전환: kind:'cg' 라인 위치에서 발동 — 그 지점부터 배경=CG, 스프라이트 숨김(장면 끝까지),
    // 대사창·TTS 는 계속. 위치 마커가 없는 기존 저장 데이터(재파싱 전)는 첫 CG 를 장면 시작부터 배경으로 폴백.
    let cgActive = false;
    if (r.cgTags.length && !s.lines.some((l) => l.kind === 'cg')) {
      out.push(`${indent(1)}scene ${r.cgTags[0]}_scene with dissolve`);
      cgActive = true;
    }
    if (s.direction.length) out.push(`${indent(1)}# 연출: ${s.direction.join(' / ')}`);

    // 아이템 팝업은 화면(screen)으로 띄운다. 장면을 넘어가면 남지 않도록 장면 끝에서 반드시 닫는다.
    let itemOpen = false;
    for (let lineIdx = 0; lineIdx < s.lines.length; lineIdx++) {
      const line = s.lines[lineIdx];
      if (line.kind === 'item') {
        const name = line.name.trim();
        if (name) {
          const tag = itemTag.get(name);
          if (tag) {
            // 해금 기록(세이브 무관 영구) → 라이트박스 팝업(딤+중앙+캡션).
            out.push(`${indent(1)}$ persistent.item_found["${tag}"] = True`);
            out.push(`${indent(1)}show screen item_popup("${tag}", "${escRpyText(name)}")`);
            itemOpen = true;
          }
        } else if (itemOpen) {
          out.push(`${indent(1)}hide screen item_popup`); // #아이템끝
          itemOpen = false;
        }
        continue;
      }
      if (line.kind === 'cg') {
        // 배경을 CG 합성판(<tag>_scene)으로 교체 — scene 문이 서 있던 스프라이트를 전부 지운다(개별 hide 불필요).
        // 같은 장면에 CG 가 또 나오면 배경만 다음 CG 로 다시 교체된다.
        const cgIdx = s.cg.findIndex((d) => d.trim() === line.desc);
        if (cgIdx >= 0 && r.cgTags[cgIdx]) {
          out.push(`${indent(1)}scene ${r.cgTags[cgIdx]}_scene with dissolve`);
          cgActive = true;
        }
        continue;
      }
      if (line.kind === 'dialogue') {
        const speakerIds = lineSpeakerIds(line, ids);
        // 이번 줄에서 처음 등장하는(스프라이트 보유) 화자를 한 번에 모아 추가 — 합동 대사로 여럿이
        // 동시에 처음 등장해도 재배치가 한 번만 일어나게. 새 등장이 있으면 전체를 다시 배치하고,
        // 이번 줄 화자가 아니면서 이미 서 있던 캐릭터 중 위치가 바뀐 쪽만 스냅 이동시킨다(속성 생략
        // — Ren'Py는 태그의 마지막 표시 속성을 유지하므로 표정·의상 재지정 불필요).
        // CG 배경이 켜진 뒤에는 스프라이트 등장·재배치를 전부 억제(장면 끝까지 인물 없음).
        const newlyRevealed = cgActive
          ? []
          : speakerIds.filter((id) => spritesByChar.has(id) && !revealedOrder.includes(id));
        if (newlyRevealed.length) {
          const prevPos = currentPos;
          revealedOrder.push(...newlyRevealed);
          currentPos = arrangePositions(revealedOrder, sideById);
          for (const id of revealedOrder) {
            if (speakerIds.includes(id)) continue;
            const oldX = prevPos.get(id);
            const newX = currentPos.get(id);
            if (oldX !== undefined && newX !== undefined && oldX !== newX) {
              out.push(`${indent(1)}show ${id} at vn_char(${newX})`);
            }
          }
        }
        const want = attrFor(effectiveEmotion(line, s));
        // 스프라이트가 있는 화자(들) 등장 — 합동 대사면 멤버 전원이 함께 선다. CG 배경 중엔 세우지 않음.
        for (const sid of cgActive ? [] : speakerIds) {
          const owned = spritesByChar.get(sid);
          if (!owned || !owned.length) continue;
          // 이 장면에서 입을 의상(없으면 기본). 해당 의상 스프라이트가 없으면 기본 의상으로 폴백.
          const wantedOutfit = s.outfits?.[owned[0].charName] ?? '기본';
          let pool = owned.filter((o) => o.outfit === wantedOutfit);
          if (!pool.length) pool = owned.filter((o) => o.outfit === '기본');
          if (!pool.length) pool = owned;
          const outfitAttr = pool[0].outfitAttr;
          const attr =
            (pool.some((o) => o.attr === want) && want) ||
            (pool.some((o) => o.attr === 'neutral') ? 'neutral' : pool[0].attr);
          out.push(`${indent(1)}show ${sid} ${outfitAttr} ${attr} at vn_char(${currentPos.get(sid) ?? 50})`);
        }
        // 말하는 주체: 합동이면 묶음 Character, 아니면 단일 화자.
        const voiceId =
          line.members && line.members.length
            ? joints.get(line.speaker)?.id ?? speakerIds[0] ?? ids.get(line.speaker)
            : ids.get(line.speaker);
        // 성우 음성(opt-in): 단일 화자 대사에만. vo() 가 persistent.voice_language 로 파일을 고르고
        // 없으면 무음 폴백하므로, 음성 파일이 아직 없어도 게임은 안전하게 실행된다.
        const spId = ids.get(line.speaker);
        if (line.voiced && !(line.members && line.members.length) && spId) {
          out.push(`${indent(1)}$ vo("${voiceBaseName(spId, r.label, lineIdx)}")`);
        }
        out.push(`${indent(1)}${voiceId} "${esc(line.text)}"`);
      } else {
        out.push(`${indent(1)}"${esc(line.text)}"`);
      }
    }

    // 장면을 넘어가기 전 아이템 팝업을 반드시 닫는다(다음 장면에 남지 않음).
    if (itemOpen) out.push(`${indent(1)}hide screen item_popup`);

    if (s.choices.length) {
      out.push(`${indent(1)}menu:`);
      for (const ch of s.choices) {
        out.push(`${indent(2)}"${esc(ch.text)}":`);
        const target = resolve(ch.target, r.ordinal);
        out.push(`${indent(3)}${target ? `jump ${target}` : 'pass'}`);
      }
    }

    if (s.jumpTo) {
      const target = resolve(s.jumpTo, r.ordinal);
      if (target) out.push(`${indent(1)}jump ${target}`);
      else out.push(`${indent(1)}# 점프 대상 '${esc(s.jumpTo)}' 을(를) 찾지 못함`);
    }
    out.push('');
  }

  // 마지막 장면이 명시 분기 없이 끝나면 자연 종료.
  out.push('label _vn_end:');
  out.push(`${indent(1)}"— 끝 —"`);
  out.push(`${indent(1)}return`);
  return out.join('\n') + '\n';
}

function optionsRpy(project: Project): string {
  const t = esc(project.title);
  // 자막 다국어를 쓰면 기본 언어(base)는 None(번역 블록 없음). 나머지는 tl/<lang> 폴더로 자동 인식된다.
  const multiText = effectiveTextLocales(project).length > 1;
  return [
    '# 자동 생성: 기본 옵션',
    `define config.name = _("${t}")`,
    `define config.version = "1.0"`,
    `define config.has_sound = True`,
    `define config.has_music = True`,
    `define config.has_voice = True`,
    ...(multiText
      ? [
          'define config.language = None  # 기본 언어(대본 원문). 설정에서 자막 언어 전환.',
          // Ren'Py 기본값(True)은 자막 언어를 바꿀 때마다 "기록"(History) 화면 내용을 통째로
          // 지운다(renpy/translation/__init__.py clean_data() — 실제 SDK 소스로 확인). 이 앱은
          // 플레이 중 언제든 언어를 바꿀 수 있어 그 기본값이 그대로 문제로 드러나므로 꺼둔다.
          'define config.clear_history_on_language_change = False  # 언어 전환해도 기록 유지',
          'init python:',
          '    def _dedup_history_on_language_switch(h):',
          '        # 언어 전환 시 Ren\'Py 가 현재 문장을 재실행해(translation.check_language()) 기록에',
          '        # 같은 줄이 한 번 더 쌓이는 걸 방지. 완전히 같은 kind/who/what 인 직전 항목만 지운다.',
          '        hist = renpy.store._history_list',
          '        if hist and hist[-1].kind == h.kind and hist[-1].who == h.who and hist[-1].what == h.what:',
          '            hist.pop()',
          '    config.history_callbacks.append(_dedup_history_on_language_switch)',
        ]
      : []),
    `define config.window_title = "${t}"`,
    `define gui.about = _("제작: ${esc(project.author)}")`,
    '',
    '## 스킵 버튼이 첫 플레이(아직 안 읽은 대사)에서도 동작하도록 기본 허용.',
    '## (플레이어가 설정 → "읽지 않은 대사" 로 끌 수 있다.)',
    'default preferences.skip_unseen = True',
    '## 자동 진행 기본 대기시간(초). 기본값이 극단이면 자동이 "안 되는" 것처럼 보여 명시한다.',
    '## (자동 켠 뒤 화면을 클릭하면 자동은 해제된다 — 정상 동작.)',
    'default preferences.afm_time = 15',
    '',
    `## 저자: ${esc(project.author)}`,
    `init python:`,
    `    config.screen_width = ${project.width}`,
    `    config.screen_height = ${project.height}`,
    '',
    '    ## ── 배포본 빌드 설정 (Ren\'Py 런처 → "Build Distributions") ──',
    `    build.name = "${t}"`,
    '    ## classify(패턴, None) = 그 파일을 배포판에서 제외 → 개발용 파일이 유저에게 안 나가게.',
    '    ## Ren\'Py 기본 제외(편집기 임시/백업/숨김 파일) — 직접 명시해 유지한다.',
    "    build.classify('**~', None)",
    "    build.classify('**.bak', None)",
    "    build.classify('**/.**', None)",
    "    build.classify('**/#**', None)",
    "    build.classify('**/thumbs.db', None)",
    '',
    '    ## 원본 아트(레이어 파일) — 완성 PNG만 배포하고 소스 파일은 제외.',
    "    build.classify('**.psd', None)",
    "    build.classify('**.psb', None)",
    "    build.classify('**.ai', None)",
    "    build.classify('**.xcf', None)",
    "    build.classify('**.kra', None)",
    "    build.classify('**.clip', None)",
    '',
    '    ## 기획서·대본·문서 등 개발 산출물 — 폴더/확장자 단위로 제외.',
    '    ## 개발용 파일은 dev/ 폴더에 모아두면 한 번에 걸러진다.',
    "    build.classify('dev/**', None)",
    "    build.classify('docs/**', None)",
    "    build.classify('기획/**', None)",
    "    build.classify('**.docx', None)",
    "    build.classify('**.xlsx', None)",
    "    build.classify('**.pptx', None)",
    "    build.classify('**.hwp', None)",
    '',
    '    ## (선택) 스크립트 묶기: 주석을 해제하면 .rpy/.rpyc 를 아카이브로 배포한다.',
    '    ## 완벽한 보호는 아니므로(디컴파일 가능) EULA/라이선스로 보완할 것.',
    "    # build.classify('game/**.rpy', 'archive')",
    "    # build.classify('game/**.rpyc', 'archive')",
    '',
    '    ## 사람이 읽는 문서로 취급(배포 폴더에 그대로 복사).',
    "    build.documentation('*.html')",
    "    build.documentation('*.txt')",
    '',
  ].join('\n');
}

function readme(theme: { label: string }): string {
  return `# Ren'Py 프로젝트 (Novel-Agent 자동 생성)

적용 테마: **${theme.label}**

## 실행 방법
1. Ren'Py SDK (https://www.renpy.org/) 설치 후 런처 실행
2. 이 폴더를 런처의 projects 디렉터리에 두거나, 런처에서 프로젝트로 추가
3. 프로젝트 선택 → Launch Project
   → 자체 제작 메인 메뉴(테마 적용)가 뜨고, 시작을 누르면 첫 장면이 재생됩니다.

이 프로젝트는 **자체 제작 풀 GUI**(메인/게임 메뉴·저장/불러오기·설정·기록·도움말 등)를
포함합니다. 메뉴 배경 외 인터페이스는 전부 코드(Solid) 기반이라 외부 GUI 이미지 의존이 없습니다.

## 포함 파일
- game/script.rpy      : 승인된 장면의 대사·연출·분기
- game/characters.rpy  : 캐릭터 정의
- game/assets.rpy      : 이미지·오디오 에셋 정의
- game/options.rpy     : 해상도·제목·저자 + 배포 빌드 제외 규칙(build.classify)
- game/credits.rpy     : 크레딧/라이선스 고지 데이터 (게임 내 "크레딧" 화면)
- game/gui.rpy         : 테마 변수(색·폰트·전환) — 자체 GUI
- game/screens.rpy     : 자체 제작 화면 전체 (zero-PNG)
- game/guisupport.rpy  : gui.scale 정의
- game/gui/            : 메뉴 배경(main_menu/game_menu PNG, Canvas 생성)
- game/fonts/          : 한글 폰트(나눔고딕, OFL) + 라이선스
- game/images/         : 배경/CG/스프라이트 PNG (생성된 것 또는 임시)
- game/audio/          : BGM WAV

## 배포본 빌드 (실행 파일 만들기)
Ren'Py 런처 → **"Build Distributions"** → 플랫폼(Windows/Mac/Linux/Web) 선택 → Build.
- options.rpy 에 **개발용 파일 제외 규칙(build.classify)** 이 들어가 있어, 빌드 시
  PSD·기획서(docx/xlsx/hwp)·dev/·docs/·기획/ 폴더는 **배포판에서 자동 제외**됩니다.
- 개발용 파일은 프로젝트 안 dev/ 폴더에 모아두면 한 번에 걸러집니다.
- 빌드 후 배포 zip 을 풀어 **개발 파일이 안 들어갔는지 한 번 확인**하세요.

## 상업/배포 전 체크리스트
- [ ] 임시 배경/합성 BGM/Canvas 메뉴 배경 → **정식 일러스트·BGM·SFX 로 교체** (테스트용임)
- [ ] 사용한 **에셋(이미지/폰트/음악)의 상업 라이선스** 확인 — 포함 나눔고딕은 OFL(상업 OK)
- [ ] AI 생성물의 약관 확인 (예: OpenAI 생성 이미지의 상업적 사용·권리 귀속)
- [ ] 폰트·BGM 의 **라이선스 고지 파일**을 배포판에 포함
- [ ] 실제 대상 OS 에서 빌드 실행 테스트
- [ ] (선택) EULA/저작권 고지, 연령 등급(필요 시) 표기
`;
}

/**
 * game/items.rpy — "발견한 아이템" 보관함 데이터. 팝업이 뜬 아이템을 persistent 로 해금 기록하고,
 * screens.rpy 의 item_gallery 가 gui.items_all(전체 목록)과 대조해 발견/미발견(？？？)을 그린다.
 */
function itemsRpy(items: ItemRef[]): string {
  const list = items.map((it) => `("${it.tag}", "${escRpyText(it.name)}")`).join(', ');
  return [
    '# 자동 생성: 발견한 아이템 보관함 데이터 (screens.rpy 의 item_gallery 화면이 사용)',
    'default persistent.item_found = dict()',
    `define gui.items_all = [ ${list} ]`,
    '',
  ].join('\n');
}

/** Ren'Py 텍스트 리터럴용 안전 이스케이프: 따옴표·역슬래시·개행 + 텍스트태그([],{}) 무력화. */
function escRpyText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\[/g, '[[')
    .replace(/\{/g, '{{')
    .replace(/%/g, '%%')
    .replace(/\r?\n/g, '\\n')
    .trim();
}

/**
 * game/credits.rpy — 게임 내 "크레딧/라이선스 고지" 화면이 쓰는 데이터.
 * screens.rpy 의 credits 화면이 gui.credits_extra 를 항상 참조하므로 이 파일은 늘 생성한다.
 */
function creditsRpy(project: Project): string {
  const extra =
    project.credits?.trim() ||
    '여기에 사용한 일러스트·BGM·효과음·성우 등의 출처와 라이선스를 적으세요. (상업 배포 전 반드시 정리)';
  return [
    '# 자동 생성: 크레딧/라이선스 고지 데이터 (screens.rpy 의 credits 화면이 사용)',
    `define gui.credits_extra = "${escRpyText(extra)}"`,
    '',
  ].join('\n');
}

/**
 * game/voices.rpy — 성우 음성 라우팅. 음성 언어(persistent.voice_language)는 자막(config.language)과
 * 완전히 독립이라, 자막 KO / 음성 JA 같은 교차 선택이 성립한다. 파일이 없으면 조용히 무음 폴백.
 */
function voicesRpy(project: Project): string {
  const voices = effectiveVoiceLocales(project);
  // 기본 음성 언어: base 가 음성 목록에 있으면 base, 아니면 첫 음성 언어.
  const base = baseLocaleOf(project);
  const def = voices.includes(base) ? base : voices[0];
  return [
    '# 자동 생성: 성우 음성 라우팅 (음성 언어 = 자막 언어와 독립)',
    `default persistent.voice_language = "${def}"`,
    '',
    'init python:',
    '    def vo(base):',
    '        # base = "c_1_scene_3_002"(언어·확장자 없음). 음성 언어는 persistent 로 자막과 독립 선택.',
    '        # 실제 저장 확장자는 원본 업로드/생성 포맷에 따라 mp3 또는 wav 일 수 있어(extFromMime,',
    '        # generate.ts) 스크립트 쪽에선 미리 알 수 없다 — 둘 다 순서대로 확인.',
    '        for ext in ("mp3", "wav"):',
    '            path = "voices/%s/%s.%s" % (persistent.voice_language, base, ext)',
    '            if renpy.loadable(path):',
    // voice() 는 renpy.exports 소속이 아니라 Ren'Py 내장 00voice.rpy 가 store(전역)에 정의한
    // 일반 함수다 — renpy.voice(...)로 부르면 AttributeError(실제 SDK 실행으로 확인, lint는 못 잡음).
    '                voice(path)   # 다음 say 에 음성 부착.',
    '                return',
    '        # 어떤 확장자로도 못 찾으면 조용히 스킵(무음).',
    '',
  ].join('\n');
}

/**
 * game/tl/<lang>/script.rpy — 자막 번역(Ren'Py 공식 번역 시스템). base 를 제외한 각 언어의
 * i18n 검수본을 `translate <lang> strings:` 의 old/new 로 내보낸다. 번역이 없는 대사는 블록을
 * 생략 → 런타임에 원문(base)으로 자연 폴백한다. 대사 텍스트는 script.rpy 의 say 와 동일하게 esc.
 * 캐릭터 이름표(i18nName, 에셋 탭에서 설정)도 같은 strings 블록에 함께 실어 보낸다 — characterDefs()
 * 가 이름을 `_()` 로 감싸둔 것과 짝을 이룬다. 합동 대사 화자(둘 이상 동시) 라벨은 대상 아님(범위 밖).
 */
function translationFiles(project: Project, refs: SceneAssetRef[]): RenpyFile[] {
  const base = baseLocaleOf(project);
  const targets = effectiveTextLocales(project).filter((l) => l !== base);
  const files: RenpyFile[] = [];
  for (const loc of targets) {
    const rl = RENPY_LANG[loc];
    if (!rl) continue; // base 로케일이 en/ja 인 특수 케이스 방어
    const seen = new Set<string>(); // 같은 원문 중복 방지(strings 블록은 원문 1개당 1매핑)
    const body: string[] = [];
    for (const r of refs) {
      for (const line of r.scene.lines) {
        if (line.kind === 'item' || line.kind === 'cg') continue; // 아이템·CG 라인은 자막 없음
        const tr = line.i18n?.[loc];
        if (!tr) continue;
        const key = esc(line.text);
        if (seen.has(key)) continue;
        seen.add(key);
        body.push(`    old "${key}"`, `    new "${esc(tr)}"`, '');
      }
    }
    for (const c of project.characters) {
      const tr = c.i18nName?.[loc];
      if (!tr) continue;
      const key = esc(c.name);
      if (seen.has(key)) continue;
      seen.add(key);
      body.push(`    old "${key}"`, `    new "${esc(tr)}"`, '');
    }
    if (!body.length) continue; // 이 언어 번역이 하나도 없으면 파일 생략
    const content = [`# 자동 생성: ${LOCALE_LABEL[loc]} 자막 번역`, `translate ${rl} strings:`, '', ...body].join('\n');
    files.push({ path: `game/tl/${rl}/script.rpy`, content: content + '\n' });
  }
  return files;
}

/** Ren'Py 문자열 리터럴 이스케이프 — 태그({…})·보간([…])은 보존하고 따옴표·역슬래시·개행만 처리. */
function escLit(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/%/g, '%%').replace(/\r?\n/g, '\\n');
}

/**
 * game/ui_strings.rpy — 엔진 확인창(quit/main menu 등)의 문구를 게임 기본 언어(base)로 재정의한다.
 * 액션이 소비하는 layout.* 과 (안전차 gui.*) 를 함께 덮어써, base 언어에서 UI 가 일관되게 뜬다.
 * (예: 한국어 프로젝트면 "정말 종료하시겠습니까?" — 기존엔 엔진 기본 영어가 떠 불일치했음.)
 * mono(단일 언어) 프로젝트에도 항상 적용된다(한국어 게임의 확인창을 한국어로).
 */
function uiStringsRpy(project: Project): string {
  const base = baseLocaleOf(project);
  const lines = [
    '# 자동 생성: 엔진 UI 문구(확인창 등)를 게임 기본 언어로 재정의 — 언어 일관성',
    '# layout.* = 액션이 실제로 쓰는 값. gui.* 도 함께 맞춘다. 타 언어는 tl/<lang>/ui.rpy 가 치환.',
    'init 999 python:',
  ];
  for (const { name, tr } of CONFIRM_STRINGS) {
    const v = `"${escLit(uiTr(tr, base))}"`;
    lines.push(`    layout.${name} = ${v}`);
    lines.push(`    gui.${name} = ${v}`);
  }
  return lines.join('\n') + '\n';
}

/**
 * game/tl/<lang>/ui.rpy — 인터페이스 문자열(확인창 + 우리 메뉴/설정/도움말 리터럴)의 언어별 번역.
 * base 를 제외한 각 자막 언어에 대해 `translate <lang> strings:` old(=base 한국어)/new(=대상)로 낸다.
 * Ren'Py 는 화면에 표시되는 문자열을 이 표로 런타임 치환하므로, 자막 언어를 바꾸면 UI 도 함께 바뀐다.
 */
function uiTranslationFiles(project: Project): RenpyFile[] {
  const base = baseLocaleOf(project);
  const targets = effectiveTextLocales(project).filter((l) => l !== base);
  const files: RenpyFile[] = [];
  for (const loc of targets) {
    const rl = RENPY_LANG[loc];
    if (!rl) continue;
    const seen = new Set<string>();
    const body: string[] = [];
    const add = (koText: string, target: string) => {
      const key = escLit(koText);
      if (seen.has(key)) return; // strings 블록은 원문 1개당 1매핑
      seen.add(key);
      body.push(`    old "${key}"`, `    new "${escLit(target)}"`, '');
    };
    for (const { tr } of CONFIRM_STRINGS) add(uiTr(tr, base), uiTr(tr, loc));
    for (const tr of UI_STRINGS) add(tr.ko, uiTr(tr, loc));
    const content = [`# 자동 생성: ${LOCALE_LABEL[loc]} UI 번역`, `translate ${rl} strings:`, '', ...body].join('\n');
    files.push({ path: `game/tl/${rl}/ui.rpy`, content: content + '\n' });
  }
  return files;
}

/** Ren'Py 텍스트 파일 전체를 생성한다. */
export function generateRenpyFiles(project: Project): {
  files: RenpyFile[];
  refs: SceneAssetRef[];
  sprites: SpriteRef[];
  characters: Character[];
} {
  const refs = resolveSceneAssets(project);
  const ids = charIdMap(project);
  // 캐릭터별 좌우 고정 위치(선택) — id 기준 맵으로 변환해 scenePositions 에 전달.
  const sideById = new Map<string, 'left' | 'right' | 'auto'>();
  for (const c of project.characters) {
    const id = ids.get(c.name);
    if (id) sideById.set(id, c.side ?? 'auto');
  }
  const plan = expressionPlan(project, ids);
  const sprites = resolveSprites(project, ids, plan);
  const joints = resolveJointSpeakers(project);
  const theme = withGuiOverrides(resolveTheme(project.genre, project.guiTheme), project.guiOverrides);

  // 다국어: 자막 언어 2개 이상이면 tl 파일·선택 UI, 음성 언어가 있으면 voices.rpy·음성 선택 UI 를 낸다.
  const textLocales = effectiveTextLocales(project);
  const voiceLocales = effectiveVoiceLocales(project);
  // 아이템(소품) 팝업 + "발견한 아이템" 보관함. 아이템이 하나라도 있으면 items.rpy·갤러리 화면·메뉴 진입을 낸다.
  const items = resolveItems(project);

  const files: RenpyFile[] = [
    { path: 'game/script.rpy', content: scriptBody(refs, ids, sprites, theme.sceneTransition, joints, project.height, items, sideById) },
    { path: 'game/characters.rpy', content: characterDefs(project, ids, joints, theme.dialogueBox) },
    { path: 'game/assets.rpy', content: assetDefs(refs, sprites, items) },
    { path: 'game/options.rpy', content: optionsRpy(project) },
    { path: 'game/credits.rpy', content: creditsRpy(project) },
    // 엔진 확인창 문구를 기본 언어로 재정의(단일 언어 프로젝트에도 항상) — 언어 일관성.
    { path: 'game/ui_strings.rpy', content: uiStringsRpy(project) },
    ...(voiceLocales.length ? [{ path: 'game/voices.rpy', content: voicesRpy(project) }] : []),
    ...(items.length ? [{ path: 'game/items.rpy', content: itemsRpy(items) }] : []),
    ...translationFiles(project, refs),
    ...uiTranslationFiles(project),
    ...generateGuiFiles(
      theme,
      project.width,
      project.height,
      {
        enabled: project.guiOverrides?.outline ?? false,
        color: project.guiOverrides?.outlineColor || '#000000',
      },
      project.guiOverrides?.dialogueGradient ?? false,
      { text: textLocales, voice: voiceLocales },
      items.length > 0,
    ),
    { path: 'README.md', content: readme(theme) },
  ];
  return { files, refs, sprites, characters: project.characters };
}
