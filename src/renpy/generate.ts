// 승인된 장면들로 Ren'Py 프로젝트 파일 집합을 생성한다.
// 파일 본문(텍스트)만 만들고, 바이너리 에셋(PNG/WAV)은 zip 빌더가 채운다.

import type {
  Project,
  Scene,
  Line,
  Character,
  Expression,
  OutfitRule,
  MenuButtonState,
  QuickButtonState,
  EscImageId,
} from '../types';
import {
  RENPY_LANG,
  LOCALE_LABEL,
  baseLocaleOf,
  effectiveTextLocales,
  effectiveVoiceLocales,
  resolveOutfit,
  spriteHiddenFlags,
  MAIN_MENU_SLOTS,
  MENU_BUTTON_STATES,
  mainMenuLayout,
  mainMenuPreset,
  mainMenuLabels,
  DEFAULT_MAIN_MENU_PRESET,
  QUICK_MENU_SLOTS,
  QUICK_BUTTON_STATES,
  quickMenuLayout,
  WINDOW_ICON_FILE,
  ESC_IMAGES,
  escColors,
} from '../types';
import { SlugMap } from './slug';
import {
  generateGuiFiles,
  resolveTheme,
  withGuiOverrides,
  DEFAULT_GRADIENT_HEIGHT,
  escSidebarLogoWidth,
  type MainMenuPlan,
  type QuickMenuPlan,
  type EscMenuPlan,
} from './gui';
import { CONFIRM_STRINGS, UI_STRINGS, uiTr } from './gui/uiStrings';
import { resolveEmotion } from '../generators/emotion';
import { enforceContrast } from '../generators/theme/color';
import { fontGamePath } from '../fonts/fontCatalog';

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
 * 오디오 blob 의 실제 MIME → 확장자. 성우 음성은 TTS 생성(Typecast, mp3 요청)뿐 아니라 사용자가
 * "📁 파일로 적용"으로 임의 포맷(wav 등)을 올릴 수도 있어, BGM 처럼 확장자를 mp3 로 무조건 고정하면
 * 안 됨(고정하면 Ren'Py 가 다른 포맷 바이트를 mp3 로 잘못 디코드 시도해 무음/오류가 날 수 있음).
 * 알 수 없는 타입은 mp3 로 폴백(기존 동작 유지, TTS 기본 요청 포맷).
 */
export function extFromMime(mime: string | undefined): 'mp3' | 'wav' {
  return mime?.includes('wav') ? 'wav' : 'mp3';
}

/** 한글 표정 → Ren'Py 이미지 속성(ASCII). 이미지 attribute 는 ASCII 가 안전. */
const EXPR_ATTR: Record<Expression, string> = {
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
function attrFor(expr: Expression): string {
  return EXPR_ATTR[expr] ?? `x${asciiSlug(expr)}`;
}

/** 의상 → Ren'Py 속성. '기본'은 base, 나머지는 슬러그. */
export function outfitAttrFor(outfit: string): string {
  return outfit === '기본' ? 'base' : `o${asciiSlug(outfit)}`;
}

interface SpriteRef {
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
 * 대사 줄의 "유효 표정" — resolveEmotion(단일 판정 소스, generators/emotion/resolve.ts)에 위임.
 * 우선순위(작가 태그 emotion > AI 배정 emotionAuto > 오프라인 휴리스틱 > '기본')와 "선언된 표정
 * 목록(effectiveExpressions)" 검증은 그쪽 파일 하나에 모여 있다 — 예전엔 이 판정을 여기·ScenePlayer
 * 두 곳이 각자 다시 짰다(emotionAuto 도입 전까지는 사실상 `line.emotion ?? inferEmotion(...)`).
 */
function effectiveEmotion(line: Line, scene: Scene, project: Project): Expression {
  return resolveEmotion(line, scene, project);
}

/** 캐릭터별로 (인페어런스 포함) 대본에서 실제 쓰이는 표정 집합. 이미지 API 생성 대상 목록이기도 하다. */
function expressionPlan(project: Project, ids: Map<string, string>): Map<string, Set<Expression>> {
  const plan = new Map<string, Set<Expression>>();
  for (const scene of project.scenes) {
    if (scene.status !== 'approved') continue;
    for (const line of scene.lines) {
      if (line.kind !== 'dialogue') continue;
      const emo = effectiveEmotion(line, scene, project);
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
function lineSpeakerIds(line: Line, ids: Map<string, string>): string[] {
  if (line.kind !== 'dialogue') return [];
  if (line.members && line.members.length) {
    return line.members.map((m) => ids.get(m)).filter((x): x is string => !!x);
  }
  const id = ids.get(line.speaker);
  return id ? [id] : [];
}

/** 합동 대사 화자(둘 이상 동시) — 이름표 묶음용 Character. 멤버는 실제 캐릭터를 그대로 공유한다. */
interface JointSpeaker {
  id: string; // cj_1 …
  label: string; // "한지수 & 강민주"
  members: string[];
  color: string;
}

/** 승인 장면에 등장하는 합동 대사 라벨 → JointSpeaker. 같은 라벨은 한 번만 정의된다. */
function resolveJointSpeakers(project: Project): Map<string, JointSpeaker> {
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
function resolveSprites(
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

/** "감상한 CG" 갤러리 항목 — 태그(assets.rpy/script.rpy 와 공유) + 갤러리 표시용 캡션. */
interface CgRef {
  tag: string;
  caption: string;
}

/**
 * resolveSceneAssets 가 이미 계산한 cgTags 를 그대로 재사용해 갤러리 목록을 만든다(새 SlugMap 을
 * 쓰면 번호가 assets.rpy/script.rpy 와 어긋나 갤러리가 존재하지 않는 이미지를 참조하게 된다).
 * 같은 CG(같은 태그)가 여러 장면에 쓰여도 한 번만, 첫 등장 순서로 수집. 캡션은 그 CG 의 설명
 * (#CG 뒤 텍스트), 비어 있으면 장면 제목으로 대체한다.
 */
export function resolveCgs(refs: SceneAssetRef[]): CgRef[] {
  const seen = new Map<string, CgRef>();
  for (const ref of refs) {
    ref.cgTags.forEach((tag, i) => {
      if (seen.has(tag)) return;
      const desc = (ref.scene.cg[i] ?? '').trim();
      seen.set(tag, { tag, caption: desc || ref.scene.title });
    });
  }
  return [...seen.values()];
}

/** 승인 장면의 에셋 참조. 배경/BGM/CG 는 "이름(의미)" 기준으로 공유된다(같은 이름 = 같은 파일). */
interface SceneAssetRef {
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
interface ItemRef {
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

/**
 * `# ...` 코멘트에 사용자 텍스트(장면 제목·연출 메모 등)를 실을 때 개행·제어문자를 공백 하나로
 * 접는다. 코멘트는 esc()(따옴표·%·[/{ 이스케이프) 대상인 문자열 리터럴이 아니라 "그 줄 전체가
 * 주석"이라는 것만 보장하면 되는데, 안 접으면(예: Excel 에서 복붙한 제목의 줄바꿈) 개행 뒤 텍스트가
 * '#' 없는 날것 줄로 script.rpy 에 섞여 들어가 문법 오류로 죽는다 — esc() 를 안 거치는 유일한 사용자
 * 텍스트 삽입 경로라 별도 헬퍼로 막는다.
 */
function commentSafe(s: string): string {
  return s.replace(/[\x00-\x1f\x7f]+/g, ' ').trim();
}

// 이스케이프 헬퍼(esc/escRpyText/escLit)는 src/renpy/escape.ts 로 옮겼다 — screensRpy.ts 가
// escRpyText 를 쓰면서 generate.ts → gui/index.ts → screensRpy.ts → generate.ts 순환 import 가
// 생겼던 걸 없애기 위함(escape.ts 는 어느 쪽도 import 하지 않는 잎 모듈). 여기서는 기존 호출부
// (특히 tests/generate-escape.test.ts)가 안 깨지도록 같은 이름으로 re-export 만 한다.
export { esc, escRpyText, escLit } from './escape';
import { esc, escRpyText, escLit } from './escape';

/**
 * 승인 장면 + 에셋 이름을 계산. 배경/BGM/CG 태그는 "이름" 기준 SlugMap 으로 발급되어
 * 같은 이름을 쓰는 여러 장면이 **같은 파일을 공유**한다(생성 1회 + 시각 일관성).
 * zip 빌더가 동일 함수로 파일명을 안다.
 */
function resolveSceneAssets(project: Project): SceneAssetRef[] {
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
function spreadPositions(n: number): number[] {
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
// export: ScenePlayer(미리보기)가 같은 배치 규칙을 그대로 재사용한다(CLAUDE.md 함정 —
// 예전엔 ScenePlayer 가 spreadPositions 만 불러 side 를 완전히 무시했다: side:'right' 고정
// 캐릭터가 미리보기에선 왼쪽에, 실제 생성 게임에선 오른쪽에 서는 불일치가 있었음).
export function arrangePositions(
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
  outfitRules: OutfitRule[] | undefined,
  characterScale: number | undefined,
  project: Project,
): string {
  const resolve = makeResolver(refs);
  const itemTag = new Map(items.map((it) => [it.name, it.tag]));
  const spritesByChar = new Map<string, SpriteRef[]>();
  for (const sp of sprites) {
    (spritesByChar.get(sp.charId) ?? spritesByChar.set(sp.charId, []).get(sp.charId)!).push(sp);
  }
  // VN 표준 구도: 전신을 다 욱여넣는 대신 머리~허벅지 정도만 화면에 담고 발은 화면 밖(대사창 뒤)으로
  // 내린다 — 실사용 스프라이트가 전신 컷이라 90% 축소로는 "멀리서 찍은 사진"처럼 작게 보이던 문제.
  // k=1.15 가 기본(사용자 슬라이더 characterScale 로 추가 배율), 머리 위 2% 여백을 두고 그만큼 아래로 내린다.
  const k = 1.15 * (characterScale ?? 1);
  const charH = Math.round(screenH * k);
  const charYpos = (k + 0.02).toFixed(3);
  const out: string[] = [];
  out.push('# 자동 생성: 메인 스크립트', '');
  // 캐릭터 배치·크기 transform — xpct(0~100) 중심, 머리~허벅지 구도(발은 화면 아래로 크롭).
  out.push('# 캐릭터 배치: 가로 0~100 중심 좌표, 머리 위 2% 여백 두고 확대(발은 화면 밖·대사창 뒤로 크롭)');
  out.push('transform vn_char(xpct=50.0):');
  out.push(`${indent(1)}fit "contain"`);
  out.push(`${indent(1)}ysize ${charH}`);
  out.push(`${indent(1)}xanchor 0.5 yanchor 1.0`);
  out.push(`${indent(1)}xpos (xpct / 100.0) ypos ${charYpos}`);
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
    // 인물 숨김(hideSprites, spriteHiddenFlags 단일 소스) — 줄마다 숨김 여부를 미리 계산해두고,
    // 전이(false→true/true→false)가 일어나는 줄에서만 hide/show 를 낸다. cgActive 와는 OR 로 합쳐
    // 판단하되, cgActive 중엔 scene 문이 이미 다 지웠으므로 hide/복원 자체를 생략한다(아래 루프 참고).
    const hiddenFlags = spriteHiddenFlags(s);
    // hide 뒤엔 태그의 속성(의상/표정) 기억이 사라지므로, 다시 보여줄 때 쓸 마지막 속성을 기록해둔다.
    const lastShown = new Map<string, { outfitAttr: string; attr: string }>();
    let hiddenNow = false; // 지금까지 반영된 "유효 숨김" 상태(장면 시작은 항상 false — 아직 아무도 안 섰으므로 hide 대상이 없다).
    out.push(`# ── ${commentSafe(s.title)} ──`);
    out.push(`label ${r.label}:`);
    out.push(`${indent(1)}scene ${r.bgTag} at vn_bg with ${transition}`);
    // BGM 재생: kind:'bgm' 라인 위치에서 발동(대본에서 #BGM 태그가 나온 그 자리) — 그전까지는 무음.
    // 위치 마커가 없는 기존 저장 데이터(재파싱 전)나 장면 맨 앞에서 지정된 곡은 지금처럼 장면 시작
    // 에서 바로 재생(폴백, 회귀 0). r.bgmFile 은 업로드본이 있을 때만 채워지므로 없으면 아무것도 안 낸다.
    if (r.bgmFile && !s.lines.some((l) => l.kind === 'bgm')) {
      out.push(`${indent(1)}play music "audio/${r.bgmFile}" fadein 1.0`);
    }
    // CG 배경 전환: kind:'cg' 라인 위치에서 발동 — 그 지점부터 배경=CG, 스프라이트 숨김(장면 끝까지),
    // 대사창·TTS 는 계속. 위치 마커가 없는 기존 저장 데이터(재파싱 전)는 첫 CG 를 장면 시작부터 배경으로 폴백.
    let cgActive = false;
    if (r.cgTags.length && !s.lines.some((l) => l.kind === 'cg')) {
      out.push(`${indent(1)}$ persistent.cg_seen["${r.cgTags[0]}"] = True`);
      out.push(`${indent(1)}scene ${r.cgTags[0]}_scene with dissolve`);
      cgActive = true;
    }
    if (s.direction.length) out.push(`${indent(1)}# 연출: ${commentSafe(s.direction.join(' / '))}`);

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
          out.push(`${indent(1)}$ persistent.cg_seen["${r.cgTags[cgIdx]}"] = True`);
          out.push(`${indent(1)}scene ${r.cgTags[cgIdx]}_scene with dissolve`);
          cgActive = true;
        }
        continue;
      }
      if (line.kind === 'bgm') {
        // 대본에서 #BGM 태그가 나온 그 위치에서 재생 시작(장면 시작 아님). r.bgmFile 이 없으면
        // (업로드본 미등록) 없는 파일을 참조하지 않도록 아무것도 내지 않는다 — 장면 시작 게이트와 동일 규칙.
        if (r.bgmFile) out.push(`${indent(1)}play music "audio/${r.bgmFile}" fadein 1.0`);
        continue;
      }
      // 인물 숨김 전이 처리 — item/cg/bgm 줄은 위에서 이미 continue 했으므로 여기 도달하는 줄은
      // 항상 대사 또는 지문이다. hidden 은 이 줄의 목표 숨김 상태(spriteHiddenFlags), cgActive 와
      // OR 로 합쳐 "유효 숨김"을 만든다 — 단, cgActive 중엔 scene 문이 이미 스프라이트를 전부 지운
      // 뒤라 우리가 또 hide/show 를 낼 필요가 없다(오히려 없는 상태를 잘못 만짐).
      const hidden = hiddenFlags[lineIdx];
      const effHidden = hidden || cgActive;
      if (!cgActive && effHidden !== hiddenNow) {
        if (effHidden) {
          // 서 있던 스프라이트를 전부 내린다. hide 뒤엔 태그의 속성 기억이 사라지므로, 다시 보여줄 때는
          // 반드시 lastShown 에 적어둔 속성으로 show 를 다시 내야 한다(속성 없는 show 는 크래시).
          for (const id of revealedOrder) out.push(`${indent(1)}hide ${id}`);
        } else {
          // 숨기기 직전 그 자리·그 표정으로 복원(lastShown). 숨김 구간에서 처음 말한 캐릭터는 애초에
          // revealedOrder 에 들어간 적이 없으므로(아래 newlyRevealed 가 숨김 중엔 항상 빈 배열) 여기서
          // 유령처럼 튀어나오지 않는다 — 다음에 말할 때 정상적으로 새로 등장한다.
          for (const id of revealedOrder) {
            const shown = lastShown.get(id);
            if (!shown) continue;
            out.push(`${indent(1)}show ${id} ${shown.outfitAttr} ${shown.attr} at vn_char(${currentPos.get(id) ?? 50})`);
          }
        }
      }
      hiddenNow = effHidden;

      if (line.kind === 'dialogue') {
        const speakerIds = lineSpeakerIds(line, ids);
        // 이번 줄에서 처음 등장하는(스프라이트 보유) 화자를 한 번에 모아 추가 — 합동 대사로 여럿이
        // 동시에 처음 등장해도 재배치가 한 번만 일어나게. 새 등장이 있으면 전체를 다시 배치하고,
        // 이번 줄 화자가 아니면서 이미 서 있던 캐릭터 중 위치가 바뀐 쪽만 스냅 이동시킨다(속성 생략
        // — Ren'Py는 태그의 마지막 표시 속성을 유지하므로 표정·의상 재지정 불필요).
        // CG 배경이 켜졌거나 인물 숨김 중이면 스프라이트 등장·재배치를 전부 억제.
        const newlyRevealed = effHidden
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
        const want = attrFor(effectiveEmotion(line, s, project));
        // 스프라이트가 있는 화자(들) 등장 — 합동 대사면 멤버 전원이 함께 선다. CG 배경·인물 숨김 중엔 세우지 않음.
        for (const sid of effHidden ? [] : speakerIds) {
          const owned = spritesByChar.get(sid);
          if (!owned || !owned.length) continue;
          // 이 장면에서 입을 의상 — 장면 직접 지정 > 배경 키워드 규칙 > 기본(resolveOutfit 우선순위).
          // 해당 의상 스프라이트가 없으면 기본 의상으로 폴백.
          const wantedOutfit = resolveOutfit(outfitRules, s, owned[0].charName);
          let pool = owned.filter((o) => o.outfit === wantedOutfit);
          if (!pool.length) pool = owned.filter((o) => o.outfit === '기본');
          if (!pool.length) pool = owned;
          const outfitAttr = pool[0].outfitAttr;
          const attr =
            (pool.some((o) => o.attr === want) && want) ||
            (pool.some((o) => o.attr === 'neutral') ? 'neutral' : pool[0].attr);
          out.push(`${indent(1)}show ${sid} ${outfitAttr} ${attr} at vn_char(${currentPos.get(sid) ?? 50})`);
          lastShown.set(sid, { outfitAttr, attr }); // 다음 숨김→표시 전환 때 이 속성으로 복원한다.
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
    // 실행 중 창·작업표시줄 아이콘. 변수는 gui.window_icon 이 아니라 **config.window_icon** 이다
    // (스톡 템플릿도 gui.rpy 가 아니라 여기 options.rpy 에 둔다 — gui.window_icon 을 정의해봐야
    //  그걸 config 로 옮겨주는 코드가 엔진 어디에도 없어 조용히 무시된다. 실행 검증으로 확인).
    // 업로드가 있을 때만 낸다 — 없는 파일을 참조하면 zip 불변식이 깨진다(buildZip 이 미리 가지친다).
    ...(project.gameIcon?.window ? [`define config.window_icon = "${WINDOW_ICON_FILE}"`] : []),
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

/**
 * game/cg.rpy — "감상한 CG" 갤러리 데이터(items.rpy 와 같은 패턴). scriptBody 가 CG 장면
 * (scene <tag>_scene)에 들어갈 때마다 persistent.cg_seen 에 기록하고, screens.rpy 의 cg_gallery
 * 화면이 gui.cgs_all(전체 목록)과 대조해 감상/미감상(？？？)을 그린다.
 */
function cgRpy(cgs: CgRef[]): string {
  const list = cgs.map((cg) => `("${cg.tag}", "${escRpyText(cg.caption)}")`).join(', ');
  return [
    '# 자동 생성: 감상한 CG 갤러리 데이터 (screens.rpy 의 cg_gallery 화면이 사용)',
    'default persistent.cg_seen = dict()',
    `define gui.cgs_all = [ ${list} ]`,
    '',
  ].join('\n');
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
        if (line.kind === 'item' || line.kind === 'cg' || line.kind === 'bgm') continue; // 아이템·CG·BGM 라인은 자막 없음
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

/**
 * project.mainMenuUi(업로드된 버튼·로고 assetId + 프리셋/라벨/폰트) → screensRpy 가 바로 쓸 수 있는
 * 렌더 계획. mainMenuUi 자체가 없으면(대부분의 프로젝트, 하위호환) undefined — screensRpy 는
 * undefined 면 기존 텍스트 메뉴를 그대로 낸다.
 *
 * "활성화" 조건은 이미지/로고뿐 아니라 **프리셋을 기본값(left-column)이 아닌 걸로 바꿨거나, 라벨을
 * 편집했거나, 메뉴 폰트를 지정한 경우**도 포함한다 — 안 그러면 사용자가 이미지 없이 프리셋만
 * 골랐을 때(이 기능의 핵심 사용 시나리오: 아트 없이도 레이아웃/라벨만 바꾸기) 아무 변화도 없이
 * 조용히 DEFAULT_MAIN_MENU_SCREEN 그대로 나가는 버그가 된다.
 */
function buildMainMenuPlan(project: Project, hasItems: boolean, hasCg: boolean): MainMenuPlan | undefined {
  const src = project.mainMenuUi;
  if (!src) return undefined;
  const buttons: MainMenuPlan['buttons'] = {};
  for (const slot of MAIN_MENU_SLOTS) {
    const states = src.buttons?.[slot.id];
    if (!states) continue;
    const present: Partial<Record<MenuButtonState, true>> = {};
    for (const st of MENU_BUTTON_STATES) {
      if (states[st.id]) present[st.id] = true;
    }
    if (Object.keys(present).length) buttons[slot.id] = present;
  }
  const preset = mainMenuPreset(project);
  const hasIdleImage = Object.values(buttons).some((st) => st?.idle);
  const hasLabelOverride = !!src.labels && Object.values(src.labels).some((l) => l?.main || l?.sub);
  const hasCustomFont = !!src.menuFontId || !!src.menuSubFontId;
  const hasPresetChange = preset.id !== DEFAULT_MAIN_MENU_PRESET;
  // showInfoLinks 는 이 활성화 조건에 넣지 않는다 — 넣으면 이미지도 프리셋도 라벨도 안 건드린
  // 프로젝트가 이 체크박스 하나만 꺼도 이미지 경로 레이아웃 전체(DEFAULT_MAIN_MENU_SCREEN 대신
  // buildImageMainMenuScreen)로 넘어가는 회귀가 된다. 기본값 true 라 "일단 켜져 있는 걸 껐다"는
  // 이미지/프리셋/라벨/폰트 중 뭔가 이미 손댄 프로젝트에서만 의미가 있다.
  if (!hasIdleImage && !src.logo && !hasPresetChange && !hasLabelOverride && !hasCustomFont) return undefined;
  // 아이템·CG 둘 다 있으면 갤러리 허브(둘 다 보여주는 중간 화면), 하나면 그걸로 바로, 없으면 비활성화.
  let galleryTarget: MainMenuPlan['galleryTarget'];
  if (hasItems && hasCg) galleryTarget = 'hub';
  else if (hasCg) galleryTarget = 'cg';
  else if (hasItems) galleryTarget = 'items';
  return {
    buttons,
    hasLogo: !!src.logo,
    // 비율을 못 잰 옛 프로젝트·가져오기 대비 폴백 3(=3:1) — 가로로 긴 타이틀 로고에 흔한 비율.
    // 정확한 값은 재업로드하면 store.importTitleLogo 가 실측해 갱신한다.
    logoAspect: src.logoAspect ?? 3,
    layout: mainMenuLayout(project),
    scale: project.height / 1080,
    galleryTarget,
    preset,
    labels: mainMenuLabels(project),
    screenWidth: project.width,
    // 미지정 = true(켜짐) — 배경 아트 위에 맨몸으로 놓이는 텍스트 프리셋의 기본 대비책(screensRpy.ts
    // buildMmStyles 참고). 아트가 이미 어두운 게임만 명시적으로 꺼서 없앤다.
    textOutline: project.mainMenuUi?.textOutline ?? true,
    // 미지정 = true(켜짐) — 정보/크레딧/도움말은 이미지 버튼 슬롯이 없어 이미지 GUI 에서 혼자 맨
    // 텍스트로 겉돈다(types.ts mainMenuUi.showInfoLinks 주석 참고). 끄면 타이틀에서만 사라진다.
    showInfoLinks: project.mainMenuUi?.showInfoLinks ?? true,
  };
}

/**
 * project.quickMenuUi(업로드된 버튼·패널 assetId) → screensRpy 가 바로 쓸 수 있는 렌더 계획.
 * mainMenuUi 와 같은 계약 — quickMenuUi 자체가 없으면(대부분의 프로젝트) undefined.
 * "활성화" 조건은 mainMenuPlan 보다 좁다 — 'menu'(토글) 슬롯의 idle 이미지 하나뿐이다. 토글 이미지가
 * 없으면 이미지 모드를 앵커할 곳이 없고, 절반만 이미지인 어색한 메뉴가 되므로 아예 텍스트로 되돌린다.
 */
function buildQuickMenuPlan(project: Project): QuickMenuPlan | undefined {
  const src = project.quickMenuUi;
  if (!src) return undefined;
  const buttons: QuickMenuPlan['buttons'] = {};
  for (const slot of QUICK_MENU_SLOTS) {
    const states = src.buttons?.[slot.id];
    if (!states) continue;
    const present: Partial<Record<QuickButtonState, true>> = {};
    for (const st of QUICK_BUTTON_STATES) {
      // press 도 여기 담길 수 있지만(store 가 이미 걸러내지만 방어적으로) screensRpy 는 절대 참조하지
      // 않는다 — 엔진에 "누르는 중" 이미지 슬롯이 없다(MainMenuPlan.buttons 와 동일한 패턴).
      if (states[st.id]) present[st.id] = true;
    }
    if (Object.keys(present).length) buttons[slot.id] = present;
  }
  if (!buttons.menu?.idle) return undefined; // 게이트: 토글 idle 이미지 필수.
  return {
    buttons,
    hasPanel: !!src.panel,
    panelWidth: src.panelWidth ?? 232,
    panelHeight: src.panelHeight ?? 625,
    layout: quickMenuLayout(project),
    scale: project.height / 1080,
  };
}

/**
 * project.escMenuUi(업로드된 ESC 메뉴 이미지 롤 → assetId) → screensRpy 가 바로 쓸 수 있는 렌더
 * 계획. mainMenuUi/quickMenuUi 와 게이트 조건이 다르다 — "슬롯 × 상태" 격자가 아니라 역할마다 파일
 * 1장인 평평한 맵이라, 하나라도 업로드돼 있으면(어떤 롤이든) 활성화한다(퀵메뉴처럼 특정 토글 이미지
 * 하나를 앵커로 요구하지 않는다 — ESC 메뉴는 새 화면이 아니라 기존 화면의 부분 스타일 교체라 "일부만
 * 이미지"가 어색하지 않다). escMenuUi 자체가 없거나 images 가 비어 있으면 undefined(회귀 0).
 */
function buildEscMenuPlan(project: Project, escFont?: string): EscMenuPlan | undefined {
  const images = project.escMenuUi?.images;
  if (!images) return undefined;
  const has = new Set<EscImageId>();
  for (const { id } of ESC_IMAGES) {
    if (images[id]) has.add(id);
  }
  if (has.size === 0) return undefined;
  // 팔레트는 **이미지가 하나라도 있을 때만** 따라 나간다. 색만 바꾸는 건 이미지 GUI 를 안 쓰는
  // 게임에도 영향을 주는 별개 기능이라 여기서 문을 열지 않는다(회귀 0 계약 유지).
  //
  // 좌측 사이드바 타이틀 로고(작업 3) — 메인 메뉴 로고(mainMenuUi.logo)를 작게 재사용한다(사용자
  // 결정). 로고 자체가 없으면(참조할 파일이 없다) 무조건 생략, 있으면 showSidebarLogo 를 명시적으로
  // false 로 끄지 않는 한 켠다(미지정=켜짐, mainMenuUi.showInfoLinks 선례). buildZip 의 로고 배치
  // 게이트(effectiveMainMenuUi.logo blob 존재)와 반드시 같아야 zip 불변식이 안 깨지는데, buildZip
  // 이 이 함수를 blob 가지치기가 끝난 effectiveProject 로 호출하므로 project.mainMenuUi?.logo 만
  // 봐도 자동으로 같은 조건이 된다(다시 blob 을 확인할 필요가 없다).
  const showLogo = !!project.mainMenuUi?.logo && project.escMenuUi?.showSidebarLogo !== false;
  let titleLogo: EscMenuPlan['titleLogo'];
  if (showLogo) {
    const width = escSidebarLogoWidth(project.height);
    const aspect = project.mainMenuUi?.logoAspect ?? 3;
    titleLogo = { width, height: Math.round(width / aspect) };
  }
  return {
    has,
    scale: project.height / 1080,
    height: project.height,
    colors: escColors(project.escMenuUi?.colors),
    // 값이 있으면 항상 'gui.esc_text_font'(gui.rpy 의 define, escFont 는 그 define 을 실제로 냈다는
    // 뜻 — guiRpy.ts 의 escFontLine 과 반드시 같은 게이트여야 없는 gui.* 변수를 참조하지 않는다).
    font: escFont ? 'gui.esc_text_font' : undefined,
    titleLogo,
  };
}

/**
 * buildZip 이 "이 폰트 슬롯은 blob 을 하나도 못 구했다"(커스텀 실패 + 대체용 기본 폰트마저 실패)를
 * 알려주는 신호 — src/zip/buildZip.ts 의 selectedFontFiles 가 실제 다운로드 결과를 보고 채운다.
 * true 인 슬롯은 fontGamePath(= "fonts/…", game/fonts/ 번들 필요) 대신 Ren'Py 엔진에 내장된
 * DejaVuSans.ttf(번들 불필요, 항상 존재)를 쓴다 — 없는 파일을 참조해 메인 메뉴/대사창에서 즉시
 * 크래시하는 것보다, 한글이 두부(□)로 보여도 게임이 켜지는 쪽이 낫다는 선택.
 */
interface FontFallback {
  /** 본문·이름·인터페이스 폰트(gui.text_font/name_text_font/interface_text_font) 전부 대상. */
  body?: boolean;
  /** 메인 메뉴 버튼 텍스트(주). */
  menu?: boolean;
  /** 메인 메뉴 버튼 텍스트(부). */
  menuSub?: boolean;
  /** ESC 메뉴 글꼴(escMenuUi.fontId). */
  esc?: boolean;
}

/** Ren'Py 텍스트 파일 전체를 생성한다. */
export function generateRenpyFiles(
  project: Project,
  fontFallback?: FontFallback,
): {
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
  let theme = withGuiOverrides(resolveTheme(project.genre, project.guiTheme), project.guiOverrides);
  if (fontFallback?.body) {
    // 본문 폰트를 아무것도 못 구한 경우(폰트 프로바이더 전면 실패) — gui.rpy 가 game/fonts/ 에 없는
    // 파일(NanumGothic.ttf 등)을 참조하면 Ren'Py 가 즉시 크래시한다. DejaVuSans.ttf 는 game/fonts/
    // 에 없어도 항상 로드된다(엔진 common 내장, buildZip 이 번들할 필요 없음).
    theme = { ...theme, textFont: 'DejaVuSans.ttf', nameFont: 'DejaVuSans.ttf', interfaceFont: 'DejaVuSans.ttf' };
  }

  // 다국어: 자막 언어 2개 이상이면 tl 파일·선택 UI, 음성 언어가 있으면 voices.rpy·음성 선택 UI 를 낸다.
  const textLocales = effectiveTextLocales(project);
  const voiceLocales = effectiveVoiceLocales(project);
  // 아이템(소품) 팝업 + "발견한 아이템" 보관함. 아이템이 하나라도 있으면 items.rpy·갤러리 화면·메뉴 진입을 낸다.
  const items = resolveItems(project);
  // "감상한 CG" 갤러리 — CG 가 하나라도 있으면 cg.rpy·갤러리 화면·메뉴 진입을 낸다.
  const cgs = resolveCgs(refs);

  // 메인 메뉴 버튼 텍스트 폰트(주/부) — mainMenuUi 전용 필드(guiOverrides 가 아님). 미지정이면
  // 주=이미 계산된 본문 폰트(theme.textFont, guiOverrides.bodyFontId 반영분), 부=주 폰트를 따라간다.
  // fontFallback.menu/menuSub 는 위 body 케이스와 같은 이유로 각각 독립적으로 DejaVuSans.ttf 로 대체한다.
  const menuTextFont = fontFallback?.menu
    ? 'DejaVuSans.ttf'
    : project.mainMenuUi?.menuFontId
      ? fontGamePath(project.mainMenuUi.menuFontId)
      : theme.textFont;
  const menuSubTextFont = fontFallback?.menuSub
    ? 'DejaVuSans.ttf'
    : project.mainMenuUi?.menuSubFontId
      ? fontGamePath(project.mainMenuUi.menuSubFontId)
      : menuTextFont;
  // ESC 메뉴 글꼴 — escMenuUi 전용 필드(guiOverrides 도 mainMenuUi 도 아님). 미지정이면 undefined 라
  // guiRpy 가 gui.esc_text_font define 자체를 안 낸다(인터페이스 폰트를 그대로 따라간다, 회귀 0).
  const escTextFont = fontFallback?.esc
    ? 'DejaVuSans.ttf'
    : project.escMenuUi?.fontId
      ? fontGamePath(project.escMenuUi.fontId)
      : undefined;

  const files: RenpyFile[] = [
    { path: 'game/script.rpy', content: scriptBody(refs, ids, sprites, theme.sceneTransition, joints, project.height, items, sideById, project.outfitRules, project.guiOverrides?.characterScale, project) },
    { path: 'game/characters.rpy', content: characterDefs(project, ids, joints, theme.dialogueBox) },
    { path: 'game/assets.rpy', content: assetDefs(refs, sprites, items) },
    { path: 'game/options.rpy', content: optionsRpy(project) },
    { path: 'game/credits.rpy', content: creditsRpy(project) },
    // 엔진 확인창 문구를 기본 언어로 재정의(단일 언어 프로젝트에도 항상) — 언어 일관성.
    { path: 'game/ui_strings.rpy', content: uiStringsRpy(project) },
    ...(voiceLocales.length ? [{ path: 'game/voices.rpy', content: voicesRpy(project) }] : []),
    ...(items.length ? [{ path: 'game/items.rpy', content: itemsRpy(items) }] : []),
    ...(cgs.length ? [{ path: 'game/cg.rpy', content: cgRpy(cgs) }] : []),
    ...translationFiles(project, refs),
    ...uiTranslationFiles(project),
    ...generateGuiFiles(theme, project.width, project.height, {
      outline: {
        enabled: project.guiOverrides?.outline ?? false,
        color: project.guiOverrides?.outlineColor || '#000000',
      },
      dialogueGradient: {
        enabled: project.guiOverrides?.dialogueGradient ?? false,
        heightRatio: project.guiOverrides?.dialogueGradientHeight ?? DEFAULT_GRADIENT_HEIGHT,
      },
      locales: { text: textLocales, voice: voiceLocales },
      hasItems: items.length > 0,
      hasCg: cgs.length > 0,
      mainMenu: buildMainMenuPlan(project, items.length > 0, cgs.length > 0),
      quickMenu: buildQuickMenuPlan(project),
      escMenu: buildEscMenuPlan(project, escTextFont),
      menuFonts: { main: menuTextFont, sub: menuSubTextFont },
      escFont: escTextFont,
    }),
    { path: 'README.md', content: readme(theme) },
  ];
  return { files, refs, sprites, characters: project.characters };
}
