// 여러 테스트 파일에 손으로 복붙되어 있던 fileOf/scene(sceneWith)/projectWith 류 헬퍼를 한 곳에
// 모은다 — 파일마다 시그니처가 미묘하게 달라(sceneWith(cg, lines) vs sceneWith(lines) vs
// sceneWith(cg, lines, id, title)) 있던 걸 옵션 객체(Partial<Scene>/Partial<Project>) 시그니처로
// 통일해 재발을 막는다. 순수 헬퍼 모음이라 그 자체로는 테스트를 담지 않는다.

import { emptyProject, type Project, type Scene, type Line } from '../src/types';
import type { RenpyFile } from '../src/renpy/generate';

/** files 배열에서 경로로 파일을 찾는다(없으면 undefined — 존재 자체를 검증하는 테스트용). */
export function fileOf(files: RenpyFile[], path: string): RenpyFile | undefined {
  return files.find((f) => f.path === path);
}

/** files 배열에서 경로로 파일 내용을 찾는다(없으면 즉시 에러 — 조용히 undefined 로 새지 않게). */
export function contentOf(files: RenpyFile[], path: string): string {
  const f = fileOf(files, path);
  if (!f) throw new Error(`fixtures.contentOf: 파일을 찾지 못함 — ${path}`);
  return f.content;
}

/** 대사 한 줄(kind: 'dialogue'). 반복되는 리터럴 축약용. */
export function dialogue(
  speaker: string,
  text: string,
  extra?: Partial<Extract<Line, { kind: 'dialogue' }>>,
): Line {
  return { kind: 'dialogue', speaker, text, ...extra };
}

/** 최소 필드로 채운 Scene. 필요한 필드만 patch 로 덮어쓴다(기본: 승인됨·id/제목 's1'/'장면1'). */
export function scene(patch: Partial<Scene> = {}): Scene {
  return {
    id: 's1',
    title: '장면1',
    direction: [],
    cg: [],
    lines: [],
    choices: [],
    status: 'approved',
    ...patch,
  };
}

/** emptyProject() 위에 scenes + 필요한 필드만 patch(캐릭터 등)를 얹는다. */
export function projectWith(scenes: Scene[], extra?: Partial<Project>): Project {
  return { ...emptyProject(), scenes, ...extra };
}

/**
 * screens.rpy 전체에는 "vbox:"/"hbox:"/"xalign 0.5"/"xanchor ..." 가 다른 화면(세이브 슬롯·페이지
 * 라벨 등)에도 무수히 등장한다 — "이 좌표/컨테이너가 나온다·안 나온다" 류의 검증은 반드시 main_menu
 * 컨테이너 블록으로 범위를 좁혀야 한다(continue_slot 대입부터 링크 버튼 전 null height 스페이서
 * 직전까지). 'null height' 는 세로 배치 스페이서뿐 아니라 preferences 화면(정적 템플릿)에도 나오므로,
 * 반드시 screen main_menu() 정의가 끝나는 지점('style main_menu_frame is empty' — base 템플릿에서
 * 항상 그 화면 바로 다음에 온다)까지로 잘라야 한다.
 */
export function mainMenuBlock(sc: string): string {
  const start = sc.indexOf('$ continue_slot = renpy.newest_slot');
  const end = sc.indexOf('style main_menu_frame is empty', start);
  return sc.slice(start, end);
}
