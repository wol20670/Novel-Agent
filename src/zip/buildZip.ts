// Ren'Py 프로젝트 ZIP 패키징.
// 텍스트 .rpy 는 generate.ts, 바이너리는 IndexedDB 의 생성 에셋을 쓰되
// 아직 생성되지 않은 배경/CG/BGM 은 즉석 폴백(Canvas/합성)으로 채워 실행 가능한 ZIP 을 보장한다.

import type { Project, MenuButtonSlot, MenuButtonState, QuickButtonSlot, QuickButtonState } from '../types';
import {
  effectiveTextLocales,
  effectiveVoiceLocales,
  MAIN_MENU_SLOTS,
  MENU_BUTTON_STATES,
  menuButtonFile,
  TITLE_LOGO_FILE,
  QUICK_MENU_SLOTS,
  QUICK_BUTTON_STATES,
  quickButtonFile,
  QUICK_PANEL_FILE,
  GAME_ICON_FILE,
  WINDOW_ICON_FILE,
} from '../types';
import { generateRenpyFiles, resolveItems, charIdMap, voiceBaseName, extFromMime } from '../renpy/generate';
import { getAsset } from '../storage/assetStore';
import { sanitizeAscii } from '../project/safeName';
import { canvasImage } from '../generators/image/canvasProvider';
import { canvasSprite } from '../generators/image/canvasSprite';
import { menuBackdropPng, solidPng, buttonBgAssets, textboxGradientPng, roundedPillPng, quickPillAssets } from '../generators/image/canvasMenu';
import {
  resolveTheme,
  dialogueGradientMetrics,
  dialogueGradientColor,
  DEFAULT_GRADIENT_OPACITY,
  DEFAULT_GRADIENT_HEIGHT,
} from '../renpy/gui';
import { loadFontCatalog, fontById, DEFAULT_FONT } from '../fonts/fontCatalog';
import { ensureFontBlob, ensureFontLicense } from '../fonts/fontCache';

// BGM 은 이제 업로드본만 있다(생성 폴백 없음) — generate.ts 가 bgmAssetId 없는 장면은
// bgmFile 자체를 만들지 않으므로, 여기 도달하는 항목은 항상 assetId 를 가진다(방어적으로만 체크).
async function blobForBgm(assetId: string | undefined): Promise<Blob | undefined> {
  return assetId ? getAsset(assetId) : undefined;
}

/**
 * 스프라이트 PNG 의 완전 투명한 여백을 잘라낸다(캐릭터 몸통 기준으로 ysize 정규화하기 위해).
 * 의상마다 캔버스 하단 여백 비율이 제각각이라(같은 캐릭터인데 4.6% vs 12.7%) vn_char 의
 * ysize 스케일이 캔버스 전체 높이를 기준으로 삼으면 의상 전환마다 캐릭터가 위아래로 튀고
 * 발이 대사창 위로 뜨는 문제가 있었다 — 여백을 미리 지워 "몸통 실제 높이"만 남긴다.
 * 배경/CG/아이템 등 다른 종류의 에셋에는 적용하지 않는다(스프라이트 전용).
 */
async function trimSpriteMargins(blob: Blob): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(blob);
    const { width, height } = bitmap;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close?.();
    const { data } = ctx.getImageData(0, 0, width, height);

    // 알파 > 8(거의 완전 투명은 제외)인 픽셀들의 바운딩 박스를 한 번의 스캔으로 구한다.
    let minX = width;
    let maxX = -1;
    let minY = height;
    let maxY = -1;
    for (let y = 0; y < height; y++) {
      const rowBase = y * width;
      for (let x = 0; x < width; x++) {
        if (data[(rowBase + x) * 4 + 3] > 8) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return blob; // 완전 투명 이미지 — 원본 그대로

    const trimmedW = maxX - minX + 1;
    const trimmedH = maxY - minY + 1;
    // 1% 미만으로 줄면(=사실상 여백 없음) 재인코딩 비용을 아끼고 원본을 그대로 쓴다.
    const shrankEnough = (width - trimmedW) / width > 0.01 || (height - trimmedH) / height > 0.01;
    if (!shrankEnough) return blob;

    const outCanvas = document.createElement('canvas');
    outCanvas.width = trimmedW;
    outCanvas.height = trimmedH;
    const outCtx = outCanvas.getContext('2d')!;
    outCtx.drawImage(canvas, minX, minY, trimmedW, trimmedH, 0, 0, trimmedW, trimmedH);
    return await new Promise<Blob>((resolve) => outCanvas.toBlob((b) => resolve(b ?? blob), 'image/png'));
  } catch {
    return blob; // 실패해도 내보내기가 깨지면 안 되므로 원본으로 폴백
  }
}

interface ZipResult {
  blob: Blob;
  filename: string;
  /** 폴백으로 즉석 생성된 에셋 수(사용자 안내용). */
  placeholders: number;
  /** 폰트를 하나도 못 구해 DejaVuSans.ttf 로 대체된 경우의 사용자 안내 문구(정상이면 undefined). */
  fontFallbackWarning?: string;
}

/** Ren'Py 프로젝트의 모든 파일(텍스트+바이너리). path 는 프로젝트 루트 기준. */
interface ProjectFile {
  path: string;
  data: string | Blob;
}

/**
 * 프로젝트의 전체 파일 목록을 수집한다(ZIP·폴더 직접쓰기 공용).
 * 미생성 배경/CG/BGM 은 폴백으로 채우고, 한글 폰트도 포함한다.
 */
export async function collectProjectFiles(
  project: Project,
): Promise<{ files: ProjectFile[]; placeholders: number; fontFallbackWarning?: string }> {
  // generateRenpyFiles 가 gui.rpy 를 만들며 폰트 경로(fontGamePath)를 동기로 조회하므로, 그 전에
  // 매니페스트를 반드시 채워둬야 한다 — 안 그러면 커스텀 폰트를 골랐어도 카탈로그가 비어 있어
  // 조용히 기본 폰트 경로로 생성되고, 뒤의 selectedFontFiles 는 카탈로그가 찬 뒤라 실제 커스텀
  // 폰트 파일을 번들해서 gui.rpy 와 game/fonts/ 내용이 서로 어긋나는 버그가 있었음.
  await loadFontCatalog();

  // 폰트 확보(다운로드 시도)를 gui.rpy 생성보다 먼저 한다 — 커스텀 폰트 다운로드가 실패하면
  // selectedFontFiles 가 파일만 기본 폰트로 대체하는데, generateRenpyFiles(project) 를 원본
  // guiOverrides 로 먼저 불러버리면 gui.rpy 는 여전히 없는 커스텀 폰트 파일명을 참조해
  // "실행 불가 zip"이 된다. adoptedIds(요청 id → 실제 채택 id)로 guiOverrides 를 보정한 뒤
  // gui.rpy 를 생성해야 파일 목록과 참조가 항상 일치한다.
  const japanese =
    effectiveTextLocales(project).includes('ja') || effectiveVoiceLocales(project).includes('ja');
  const fontResult = await selectedFontFiles(project.guiOverrides, project.mainMenuUi, japanese);
  const effectiveGuiOverrides = adoptGuiOverrideFonts(project.guiOverrides, fontResult.adoptedIds);
  const mainMenuUiWithFonts = adoptMainMenuUiFonts(project.mainMenuUi, fontResult.adoptedIds);
  // 폰트와 같은 이유로, 메뉴 버튼/로고도 blob 이 실제로 있는 것만 남도록 gui.rpy 생성 전에
  // 미리 가지치기한다(resolveMainMenuArt, 위 — adopt*Fonts 와 동일 패턴). blobs 는 아래 파일
  // 목록 조립부가 재사용해 같은 assetId 로 getAsset 을 두 번 부르지 않는다.
  const { mainMenuUi: effectiveMainMenuUi, blobs: menuArtBlobs } = await resolveMainMenuArt(mainMenuUiWithFonts);
  // 퀵메뉴는 mainMenuUi 와 달리 폰트 필드가 없으므로(QuickMenuLayout 에 menuFontId 류가 없다)
  // adoptGuiOverrideFonts/adoptMainMenuUiFonts 대상이 아니다 — project.quickMenuUi 를 그대로 넣는다.
  const { quickMenuUi: effectiveQuickMenuUi, blobs: quickArtBlobs } = await resolveQuickMenuArt(project.quickMenuUi);
  // 게임 아이콘도 같은 이유로 미리 가지치기한다 — 특히 창 아이콘은 blob 이 있어야만 gui.rpy 가
  // `define gui.window_icon` 을 내보내도 되기 때문에(없는 파일을 참조하면 zip 불변식이 깨진다).
  const { gameIcon: effectiveGameIcon, blobs: iconBlobs } = await resolveGameIcon(project.gameIcon);
  const effectiveProject: Project =
    effectiveGuiOverrides === project.guiOverrides &&
    effectiveMainMenuUi === project.mainMenuUi &&
    effectiveQuickMenuUi === project.quickMenuUi &&
    effectiveGameIcon === project.gameIcon
      ? project
      : {
          ...project,
          guiOverrides: effectiveGuiOverrides,
          mainMenuUi: effectiveMainMenuUi,
          quickMenuUi: effectiveQuickMenuUi,
          gameIcon: effectiveGameIcon,
        };

  // fontResult.unresolved: 커스텀 폰트뿐 아니라 대체용 기본 폰트(나눔고딕)까지 못 구한 경우 —
  // gui.rpy 가 game/fonts/ 에 없는 파일을 참조하지 않도록 generateRenpyFiles 에 신호를 넘긴다
  // (fontFallback, generate.ts — DejaVuSans.ttf 로 대체). 정상 케이스(전부 성공)는 세 값 모두
  // false 라 generateRenpyFiles 동작이 기존과 완전히 같다(회귀 0).
  const { files: textFiles, refs, sprites } = generateRenpyFiles(effectiveProject, fontResult.unresolved);
  const out: ProjectFile[] = textFiles.map((f) => ({ path: f.path, data: f.content }));

  let placeholders = fontResult.placeholders;
  for (const f of fontResult.files) out.push(f);

  // 캐릭터 스프라이트 (생성된 assetId → blob, 없으면 Canvas 폴백)
  // 업로드본은 의상마다 캔버스 하단 투명 여백이 제각각이라, vn_char 의 ysize 정규화 전에
  // 여백을 미리 잘라 "몸통 실제 높이" 기준으로 맞춘다(대량 스프라이트라 순차 처리).
  for (const sp of sprites) {
    let blob = sp.assetId ? await getAsset(sp.assetId) : undefined;
    if (!blob) {
      const color = project.characters.find((c) => c.name === sp.charName)?.color ?? '#9fd3ff';
      blob = await canvasSprite(sp.charName, sp.expr, color);
      placeholders++;
    }
    blob = await trimSpriteMargins(blob);
    out.push({ path: `game/images/${sp.file}`, data: blob });
  }
  // 배경/BGM/CG 는 "이름" 기준으로 공유되므로, 파일 1개당 1회만 생성한다.
  // (같은 파일을 여러 장면이 참조 → 800장면이라도 고유 배경 수만큼만 생성/포함)
  // assetId 가 있는 장면을 대표로 우선 선택(실제 생성/업로드본 사용).
  interface AssetPick {
    assetId?: string;
    prompt: string;
    label: string;
  }
  const bgByFile = new Map<string, AssetPick>();
  const bgmByFile = new Map<string, AssetPick>();
  const cgByFile = new Map<string, AssetPick>();
  const consider = (
    map: Map<string, AssetPick>,
    file: string,
    assetId: string | undefined,
    prompt: string,
    label: string,
  ) => {
    const cur = map.get(file);
    if (!cur) map.set(file, { assetId, prompt, label });
    else if (assetId && !cur.assetId) cur.assetId = assetId; // 대표를 실제 에셋 보유 장면으로 승격
  };

  for (const ref of refs) {
    const s = ref.scene;
    consider(
      bgByFile,
      ref.bgFile,
      s.backgroundAssetId,
      [s.background || s.title, ...s.direction].join(', '),
      s.background || s.title,
    );
    ref.cgFiles.forEach((file, j) =>
      consider(cgByFile, file, s.cgAssetIds?.[j], s.cg[j], `CG: ${s.cg[j]}`),
    );
    if (ref.bgmFile) consider(bgmByFile, ref.bgmFile, s.bgmAssetId, s.bgm || s.title, s.bgm || s.title);
  }

  for (const [file, p] of bgByFile) {
    // 예전엔 "있는지"(had)와 "가져오기"(blobForBackground 내부)가 각각 getAsset 을 불러 같은
    // assetId 를 두 번 읽었다 — 한 번만 읽고 결과로 분기(placeholders 카운트 의미는 동일).
    const existing = p.assetId ? await getAsset(p.assetId) : undefined;
    const bg = existing ?? (await canvasImage(p.prompt, p.label, project.width, project.height));
    if (!existing) placeholders++;
    out.push({ path: `game/images/${file}`, data: bg });
  }
  for (const [file, p] of cgByFile) {
    const up = p.assetId ? await getAsset(p.assetId) : null;
    const cg = up ?? (await canvasImage(p.prompt, p.label, project.width, project.height));
    if (!up) placeholders++;
    out.push({ path: `game/images/${file}`, data: cg });
  }
  for (const [file, p] of bgmByFile) {
    const bgm = await blobForBgm(p.assetId);
    if (bgm) out.push({ path: `game/audio/${file}`, data: bgm }); // 없으면 건너뜀(방어적 — 정상 경로에선 항상 있음)
  }

  // 성우 음성(VoiceLab 로 매단 언어별 파일) — voices.rpy 의 vo() 가 런타임에 찾는 결정적 경로
  // game/voices/{lang}/{charId}_{sceneLabel}_{lineIdx}.{mp3|wav} 를 채운다(같은 refs·charIdMap 사용
  // → generate.ts 가 emit 한 $ vo("...") 인자와 항상 일치). 합동 대사(members)는 generate.ts 도
  // vo() 를 안 내므로 여기서도 건너뛴다. 확장자는 실제 blob MIME 기준(extFromMime) — mp3 로 고정하면
  // wav 등 다른 포맷이 잘못 라벨링돼 무음이 나는 버그가 있었음(vo() 도 둘 다 순서대로 찾도록 맞춰둠).
  const charIds = charIdMap(project);
  const voiceJobs: { base: string; locale: string; assetId: string }[] = [];
  for (const ref of refs) {
    ref.scene.lines.forEach((line, lineIdx) => {
      if (line.kind !== 'dialogue' || (line.members && line.members.length) || !line.voiceAssetIds) return;
      const charId = charIds.get(line.speaker);
      if (!charId) return;
      const base = voiceBaseName(charId, ref.label, lineIdx);
      for (const [locale, assetId] of Object.entries(line.voiceAssetIds)) {
        if (!assetId) continue;
        voiceJobs.push({ base, locale, assetId });
      }
    });
  }
  // getAsset 은 건마다 독립 IndexedDB 트랜잭션이라(assetStore.ts), 성우가 빽빽한 대본은 순차 호출 시
  // 수천 회 왕복이 압축 시작 전에 직렬로 쌓인다 — 50개씩 묶어 병렬로 읽되, 청크는 순차 처리하고
  // 청크 내부도 job 순서 그대로 push해 파일 목록 순서(=기존 순차 루프 출력)를 그대로 보존한다.
  const VOICE_READ_CHUNK = 50;
  for (let i = 0; i < voiceJobs.length; i += VOICE_READ_CHUNK) {
    const chunk = voiceJobs.slice(i, i + VOICE_READ_CHUNK);
    const blobs = await Promise.all(chunk.map((job) => getAsset(job.assetId)));
    chunk.forEach((job, idx) => {
      const blob = blobs[idx];
      if (!blob) return; // 없으면 건너뜀(vo() 가 무음 폴백)
      const ext = extFromMime(blob.type);
      out.push({ path: `game/voices/${job.locale}/${job.base}.${ext}`, data: blob });
    });
  }

  // 아이템(소품) 팝업 이미지 — 이름 기준 공유. assetId 있으면 그 blob, 없으면 Canvas placeholder.
  for (const it of resolveItems(project)) {
    const up = it.assetId ? await getAsset(it.assetId) : null;
    const blob = up ?? (await canvasImage(it.name, `아이템: ${it.name}`, 512, 512));
    if (!up) placeholders++;
    out.push({ path: `game/images/${it.file}`, data: blob });
  }

  // 타이틀·메뉴 배경 — 업로드 전용(앱은 그림을 생성하지 않음). 업로드가 없으면 테마색
  // 그라데이션 폴백만 깐다(장식 아트 없음, 게임이 안 깨지게 하는 최소한의 대비책).
  const theme = resolveTheme(project.genre, project.guiTheme);
  const menuArtFor = async (which: 'main' | 'game'): Promise<Blob> => {
    const upId = project.menuArt?.[which];
    if (upId) {
      const up = await getAsset(upId);
      if (up) return up;
    }
    placeholders += 1;
    return menuBackdropPng(theme, project.width, project.height);
  };
  out.push({ path: 'game/gui/main_menu.png', data: await menuArtFor('main') });
  out.push({ path: 'game/gui/game_menu.png', data: await menuArtFor('game') });

  // 메인 메뉴 이미지 GUI(업로드 전용) — 업로드된 버튼·로고만 배치한다. 미업로드 버튼은 선택 기능이라
  // placeholder 카운트를 올리지 않는다("임시 에셋 N개 포함" 경고를 이 선택 기능으로 오염시키지 않기 위함).
  // 경로는 반드시 types.ts 의 menuButtonFile/TITLE_LOGO_FILE 로 만든다(screensRpy 도 같은 헬퍼 사용 —
  // 어긋나면 없는 파일을 참조해 런타임 크래시가 난다). effectiveMainMenuUi 는 이미 resolveMainMenuArt
  // 가 blob 없는 상태/로고를 걸러낸 뒤라 여기 남아있는 assetId 는 항상 menuArtBlobs 에 있다(같은
  // assetId 로 getAsset 을 또 부르지 않고 위에서 이미 읽은 blob 을 재사용).
  for (const slot of MAIN_MENU_SLOTS) {
    for (const state of MENU_BUTTON_STATES) {
      if (!state.renpySupported) continue; // press — 저장돼 있어도(구버전 잔존 등) 출력하지 않는다.
      const assetId = effectiveMainMenuUi?.buttons?.[slot.id]?.[state.id];
      if (!assetId) continue;
      const blob = menuArtBlobs.get(assetId);
      if (!blob) continue; // 방어적(resolveMainMenuArt 를 거쳤으면 항상 있어야 함).
      out.push({ path: `game/${menuButtonFile(slot.id, state.id)}`, data: blob });
    }
  }
  if (effectiveMainMenuUi?.logo) {
    const blob = menuArtBlobs.get(effectiveMainMenuUi.logo);
    if (blob) out.push({ path: `game/${TITLE_LOGO_FILE}`, data: blob });
  }

  // 퀵메뉴 이미지 GUI(업로드 전용) — mainMenuUi 블록과 동일 패턴(경로는 quickButtonFile/QUICK_PANEL_FILE
  // 단일 소스, screensRpy 도 같은 헬퍼 사용). 미업로드 버튼은 선택 기능이라 placeholders 를 올리지
  // 않는다. effectiveQuickMenuUi 는 이미 resolveQuickMenuArt 가 blob 없는 상태/패널을 걸러낸 뒤라
  // 여기 남은 assetId 는 항상 quickArtBlobs 에 있다(같은 assetId 로 getAsset 을 또 부르지 않음).
  for (const slot of QUICK_MENU_SLOTS) {
    for (const state of QUICK_BUTTON_STATES) {
      if (!state.renpySupported) continue; // press — 저장돼 있어도 출력하지 않는다.
      const assetId = effectiveQuickMenuUi?.buttons?.[slot.id]?.[state.id];
      if (!assetId) continue;
      const blob = quickArtBlobs.get(assetId);
      if (!blob) continue; // 방어적(resolveQuickMenuArt 를 거쳤으면 항상 있어야 함).
      out.push({ path: `game/${quickButtonFile(slot.id, state.id)}`, data: blob });
    }
  }
  if (effectiveQuickMenuUi?.panel) {
    const blob = quickArtBlobs.get(effectiveQuickMenuUi.panel);
    if (blob) out.push({ path: `game/${QUICK_PANEL_FILE}`, data: blob });
  }

  // 게임 아이콘 — ico 는 **game/ 밖 프로젝트 루트**로 나간다(Ren'Py 런처가 거기만 본다).
  // ProjectFile.path 가 원래 프로젝트 루트 기준이라 README.md 처럼 접두어 없이 넣으면 된다.
  if (effectiveGameIcon?.ico) {
    const blob = iconBlobs.get(effectiveGameIcon.ico);
    if (blob) out.push({ path: GAME_ICON_FILE, data: blob });
  }
  if (effectiveGameIcon?.window) {
    const blob = iconBlobs.get(effectiveGameIcon.window);
    if (blob) out.push({ path: `game/${WINDOW_ICON_FILE}`, data: blob });
  }

  // 버튼 배경 PNG(gui.button_properties 요구) — 제네릭 prefix 세트.
  for (const b of buttonBgAssets(theme)) {
    out.push({ path: `game/gui/button/${b.name}`, data: await solidPng(b.color) });
  }

  // 퀵메뉴(우상단 드롭다운) 알약 배경 — 제네릭 버튼 배경(투명)을 quick_button 스타일에서만
  // 덮어써 가독성을 확보한다(screensRpy.ts 의 style quick_button 참고).
  for (const p of quickPillAssets(theme)) {
    out.push({ path: `game/gui/${p.name}`, data: await roundedPillPng(p.fill, p.border) });
  }

  // 대사창 그라데이션(투명) 켜짐 → 세로 그라데이션 텍스트박스 PNG 생성(색·진하기·높이는 사용자 조정값).
  if (project.guiOverrides?.dialogueGradient) {
    // 색 미지정이면 검정이 아니라 테마의 dialogueBox 색을 쓴다 — 단색 박스 경로(withGuiOverrides)가
    // 이미 이 색을 쓰므로, 그라데이션도 같은 색이어야 테마의 dialogueText(글자색)와 대비가 맞는다.
    // 하드코딩 검정은 밝은 테마(romance/slice: 흰 배경 + 어두운 글자)에서 본문을 거의 안 보이게
    // 만들었다(실기 확인 — theme 는 resolveTheme() 을 거쳐 ensureReadableMenu 까지 적용된 값).
    const boxColor = dialogueGradientColor(theme, project.guiOverrides.dialogueBoxColor);
    const maxAlpha = project.guiOverrides.dialogueGradientOpacity ?? DEFAULT_GRADIENT_OPACITY;
    // guiRpy 가 계산한 것과 반드시 같은 boxHeight 를 써야 한다 — 어긋나면 gui.rpy 의 창 크기와
    // PNG 픽셀 높이가 달라 Frame 이 이미지를 늘려/줄여 곡선이 뭉개진다(CLAUDE.md 의 "양쪽 일치 필수" 함정).
    const { boxHeight } = dialogueGradientMetrics(
      project.height,
      project.guiOverrides.dialogueGradientHeight ?? DEFAULT_GRADIENT_HEIGHT,
    );
    out.push({ path: 'game/gui/textbox.png', data: await textboxGradientPng(boxColor, maxAlpha, boxHeight) });
  }

  // 한글·일본어 폰트 파일(game/fonts/)은 위에서 gui.rpy 생성 전에 이미 확보해 out 에 담아뒀다
  // (fontResult) — placeholders 도 이미 그 값으로 초기화됨.

  // 폰트를 하나도 못 구해 DejaVuSans.ttf(엔진 내장)로 대체된 경우 — placeholders 카운트("임시 에셋
  // N개 포함")는 이미지 placeholder 용 지표라 이 경고를 섞으면 성격이 다른 문제(한글이 아예 안 보일
  // 수 있음)가 묻힌다. 조용히 넘어가지 않도록 별도 필드로 명시적으로 알린다(호출 측이 토스트 등으로
  // 노출하면 됨 — placeholders 와 같은 "결과에 실어 보내는" 컨벤션).
  const fontFallbackWarning = fontResult.unresolved.body
    ? '본문/이름 폰트를 하나도 구하지 못해 Ren\'Py 기본 폰트(DejaVuSans)로 대체했습니다 — 한글이 빈 네모(두부)로 보일 수 있습니다. 네트워크 상태를 확인한 뒤 다시 내보내 보세요.'
    : undefined;

  return { files: out, placeholders, fontFallbackWarning };
}

export async function buildRenpyZip(project: Project): Promise<ZipResult> {
  const { default: JSZip } = await import('jszip'); // 지연 로딩(초기 번들 경량화)
  const { files, placeholders, fontFallbackWarning } = await collectProjectFiles(project);
  const zip = new JSZip();
  for (const f of files) zip.file(f.path, f.data);

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  const safeName = sanitizeAscii(project.title, 40, 'visual-novel');
  return { blob, filename: `${safeName}_renpy.zip`, placeholders, fontFallbackWarning };
}

/**
 * 선택한 본문/이름/메뉴 폰트(왼쪽 패널 GUI 설정 + 메인 메뉴 프리셋 설정, 기본은 나눔고딕 번들) +
 * (일본어 프로젝트면) SourceHanSansLite 를 game/fonts/ 에 넣을 파일 목록으로 만든다.
 * - 나눔고딕: 한글·라틴 본문(Ren'Py 기본 폰트는 한글 글리프 없음) — 본문/이름/메뉴 어느 한쪽이라도
 *   기본 폰트를 쓰면(미지정이 기본) 나눔고딕과 public/fonts/OFL.txt 를 함께 포함한다.
 * - SourceHanSansLite: 일본어(かな·한자) 자막/UI 용. gui.rpy 의 FontGroup 이 일본어 범위만 이 폰트로
 *   폴백한다(나눔고딕은 일본어 글리프가 없어 자막이 빈칸으로 나오는 문제 대응). 둘 다 SIL OFL 1.1.
 * - 커스텀(GCS) 폰트 다운로드 실패 시 기본 폰트로 자동 폴백(오프라인에도 항상 실행 가능한 zip 보장) —
 *   이 경우 placeholders 카운트를 올려 호출 측 토스트("임시 에셋 N개 포함")에 반영한다.
 * - 메뉴 폰트(mainMenuUi.menuFontId/menuSubFontId)는 guiOverrides 가 아니라 mainMenuUi 에 저장되므로
 *   별도 인자로 받는다 — 안 받으면 커스텀 메뉴 폰트를 고른 프로젝트가 gui.rpy 는 그 폰트를 참조하는데
 *   game/fonts/ 엔 파일이 없어 게임이 안 켜지는 CLAUDE.md 함정 그대로 재현된다.
 *
 * adoptedIds: "요청한 폰트 id → 실제로 파일을 넣은 폰트 id" 매핑. 다운로드 실패로 기본 폰트로
 * 대체된 경우 요청 id와 달라지므로, 호출 측이 gui.rpy 생성 전에 guiOverrides/mainMenuUi 를 이
 * 매핑으로 보정해야 gui.rpy(참조 파일명) ↔ game/fonts/(실제 번들) 가 항상 일치한다(P0-3).
 */
async function selectedFontFiles(
  guiOverrides: Project['guiOverrides'],
  mainMenuUi: Project['mainMenuUi'],
  includeJapanese: boolean,
): Promise<{
  files: ProjectFile[];
  placeholders: number;
  adoptedIds: Map<string, string>;
  /**
   * 슬롯별로 blob 을 "하나도" 못 구했는지(커스텀 실패 → 기본 폰트 대체 시도까지 실패) —
   * generate.ts 의 FontFallback 으로 그대로 넘겨 gui.rpy 가 DejaVuSans.ttf(번들 불필요)를
   * 참조하게 한다. adoptedIds 만으로는 이 케이스를 구분할 수 없다(대체 실패해도 actual 은
   * 여전히 DEFAULT_FONT 로 세팅되어 있어 "정상 대체"와 구별이 안 됨 — 그래서 별도 필드로 뺐다).
   */
  unresolved: { body: boolean; menu: boolean; menuSub: boolean };
}> {
  // 호출 측(collectProjectFiles)이 gui.rpy 생성 전에 이미 로드해두지만, 이 함수만 독립 호출될 가능성도
  // 방어(loadFontCatalog 는 캐시돼 있으면 즉시 반환이라 비용 없음).
  await loadFontCatalog();

  // bodyFontId 미지정이어도 실제로는 기본 폰트가 쓰이므로(theme.ts withGuiOverrides), 여기서도
  // 항상 기본 폰트를 wanted 에 포함시켜야 gui.rpy 가 참조하는 파일과 번들 내용이 일치한다.
  const bodyId = guiOverrides?.bodyFontId ?? DEFAULT_FONT.id;
  const nameId = guiOverrides?.nameFontId ?? bodyId;
  // 메뉴 폰트도 같은 폴백 규칙(generate.ts/guiRpy.ts 와 동일: 주=본문, 부=주)으로 미리 해석해둬야
  // 미지정 프로젝트(대부분)는 bodyId 와 겹쳐 Set 으로 중복 제거되고, 실제로 커스텀 지정한 프로젝트만
  // 추가 다운로드가 발생한다(기존 프로젝트 배포 zip 크기/동작에 회귀 없음).
  const menuId = mainMenuUi?.menuFontId ?? bodyId;
  const menuSubId = mainMenuUi?.menuSubFontId ?? menuId;
  const requestedIds = [...new Set([bodyId, nameId, menuId, menuSubId])];
  const wanted = requestedIds.map((id) => fontById(id));

  // 본문/이름 폰트를 병렬로 확보(각각 독립적인 GCS 다운로드일 수 있음).
  const resolved = await Promise.all(
    wanted.map(async (preset) => {
      let actual = preset;
      let blob = await ensureFontBlob(preset.id);
      let placeholder = false;
      if (!blob && !preset.bundled) {
        // 커스텀 폰트 다운로드 실패 → 기본 폰트로 대체(실행 가능한 zip 보장).
        console.warn(`[fonts] ${preset.label} 다운로드 실패 — 기본 폰트로 대체`);
        actual = DEFAULT_FONT;
        blob = await ensureFontBlob(DEFAULT_FONT.id);
        placeholder = !!blob; // 대체 폰트마저 실패하면 아무것도 안 넣으므로 placeholder 로 세지 않는다.
      }
      const license = blob && !actual.bundled ? await ensureFontLicense(actual.id) : undefined;
      return { requestedId: preset.id, actual, blob, license, placeholder };
    }),
  );

  const adoptedIds = new Map(resolved.map((r) => [r.requestedId, r.actual.id]));

  const files: ProjectFile[] = [];
  const seenFiles = new Set<string>(); // 본문=이름 동일 폰트 등 중복 방지
  let placeholders = 0;
  for (const r of resolved) {
    if (!r.blob || seenFiles.has(r.actual.file)) continue;
    seenFiles.add(r.actual.file);
    files.push({ path: `game/fonts/${r.actual.file}`, data: r.blob });
    if (r.license) files.push({ path: `game/fonts/${r.actual.id}-OFL.txt`, data: r.license });
    if (r.placeholder) placeholders++;
  }

  const base = import.meta.env.BASE_URL || '/';
  const [licenseRes, jpRes] = await Promise.all([
    seenFiles.has(DEFAULT_FONT.file) ? fetch(`${base}fonts/OFL.txt`).catch(() => null) : null,
    includeJapanese ? fetch(`${base}fonts/SourceHanSansLite.ttf`).catch(() => null) : null,
  ]);
  if (licenseRes?.ok) files.push({ path: 'game/fonts/OFL.txt', data: await licenseRes.text() });
  if (jpRes?.ok) files.push({ path: 'game/fonts/SourceHanSansLite.ttf', data: await jpRes.blob() });

  // bodyId/nameId 는 항상 함께 실패한다고 가정하지 않고 각각 확인한다(대사 이름 폰트만 따로 지정해
  // 그것만 실패하는 경우도 이론상 가능) — 하나라도 blob 을 못 구했으면 body 전체(본문+이름+인터페이스,
  // generate.ts 에서 함께 대체)를 DejaVuSans.ttf 폴백 대상으로 잡는다(둘을 갈라 쓰는 것보다 안전).
  const gotBlob = (id: string) => resolved.some((r) => r.requestedId === id && r.blob);
  const unresolved = {
    body: !gotBlob(bodyId) || !gotBlob(nameId),
    menu: !gotBlob(menuId),
    menuSub: !gotBlob(menuSubId),
  };

  return { files, placeholders, adoptedIds, unresolved };
}

/**
 * 요청한 커스텀 폰트가 다운로드 실패로 다른 id(기본 폰트)로 대체됐다면, gui.rpy 생성 전에
 * guiOverrides 도 그 실제 채택 id로 보정한다 — 안 하면 gui.rpy 는 여전히 없는 파일을 참조한다.
 * 대체가 없었다면(정상 다운로드/애초에 미지정) 원본 객체를 그대로 반환(불필요한 재생성 방지).
 */
function adoptGuiOverrideFonts(
  guiOverrides: Project['guiOverrides'],
  adoptedIds: Map<string, string>,
): Project['guiOverrides'] {
  if (!guiOverrides) return guiOverrides;
  const nextBody = guiOverrides.bodyFontId && adoptedIds.get(guiOverrides.bodyFontId);
  const nextName = guiOverrides.nameFontId && adoptedIds.get(guiOverrides.nameFontId);
  const bodyChanged = !!nextBody && nextBody !== guiOverrides.bodyFontId;
  const nameChanged = !!nextName && nextName !== guiOverrides.nameFontId;
  if (!bodyChanged && !nameChanged) return guiOverrides;
  return {
    ...guiOverrides,
    ...(bodyChanged ? { bodyFontId: nextBody } : {}),
    ...(nameChanged ? { nameFontId: nextName } : {}),
  };
}

/**
 * adoptGuiOverrideFonts 와 동일한 목적이지만 mainMenuUi.menuFontId/menuSubFontId 대상 — 이 두 필드는
 * guiOverrides 가 아니라 mainMenuUi 에 저장되므로 별도 함수로 보정한다(안 하면 다운로드 실패 시
 * gui.rpy 는 대체 폰트를 참조하는데 mainMenuUi 가 여전히 원래 id를 들고 있어 다음 저장/재생성 때
 * 불일치가 재발할 수 있음 — adoptGuiOverrideFonts 와 같은 이유).
 */
function adoptMainMenuUiFonts(
  mainMenuUi: Project['mainMenuUi'],
  adoptedIds: Map<string, string>,
): Project['mainMenuUi'] {
  if (!mainMenuUi) return mainMenuUi;
  const nextMenu = mainMenuUi.menuFontId && adoptedIds.get(mainMenuUi.menuFontId);
  const nextSub = mainMenuUi.menuSubFontId && adoptedIds.get(mainMenuUi.menuSubFontId);
  const menuChanged = !!nextMenu && nextMenu !== mainMenuUi.menuFontId;
  const subChanged = !!nextSub && nextSub !== mainMenuUi.menuSubFontId;
  if (!menuChanged && !subChanged) return mainMenuUi;
  return {
    ...mainMenuUi,
    ...(menuChanged ? { menuFontId: nextMenu } : {}),
    ...(subChanged ? { menuSubFontId: nextSub } : {}),
  };
}

/**
 * 메인 메뉴 버튼/로고 blob 을 generateRenpyFiles(gui.rpy·screens.rpy 생성) 전에 미리 확보하고,
 * 실제로 blob 이 있는 상태/로고만 남도록 mainMenuUi 를 가지치기한다 — selectedFontFiles →
 * adoptGuiOverrideFonts/adoptMainMenuUiFonts(위)와 정확히 같은 패턴이다. 참조 쪽(screensRpy 의
 * buildMainMenuPlan, generate.ts:957-966)은 project.mainMenuUi.buttons[slot][state]에 assetId가
 * "있는지"만 보고, 배치 쪽(아래 파일 목록 조립부)은 blob 이 "있을 때만" 파일을 쓴다 — 이 둘이
 * 따로 놀면 assetId 는 있는데 blob 이 없는 경우(부분 복원된 .npproj.zip, 브라우저 IndexedDB 축출)
 * 없는 파일을 참조하는 zip 이 나가 Ren'Py 가 메인 메뉴에서 크래시한다. 여기서 미리 걸러두면
 * generateRenpyFiles 는 애초에 그 상태/로고를 "없음"으로 보고 텍스트 버튼 폴백으로 낸다(정상
 * 케이스 — blob 이 전부 있으면 — 는 가지치기가 아무것도 안 하므로 출력이 기존과 완전히 같다).
 * 반환하는 blobs 는 파일 목록 조립부가 재사용한다(같은 assetId 로 getAsset 을 두 번 안 부르려고).
 */
async function resolveMainMenuArt(
  mainMenuUi: Project['mainMenuUi'],
): Promise<{ mainMenuUi: Project['mainMenuUi']; blobs: Map<string, Blob> }> {
  if (!mainMenuUi) return { mainMenuUi, blobs: new Map() };
  const blobs = new Map<string, Blob>();

  const buttons: Partial<Record<MenuButtonSlot, Partial<Record<MenuButtonState, string>>>> = {};
  for (const slot of MAIN_MENU_SLOTS) {
    const states = mainMenuUi.buttons?.[slot.id];
    if (!states) continue;
    const kept: Partial<Record<MenuButtonState, string>> = {};
    for (const state of MENU_BUTTON_STATES) {
      const assetId = states[state.id];
      if (!assetId) continue;
      if (!state.renpySupported) {
        // press 는 애초에 절대 출력되지 않는다(엔진에 눌림 상태를 세팅하는 코드가 없음 — 아래 파일
        // 목록 조립부도 이 상태는 건너뜀). blob 존재 여부와 무관하게 레거시 값을 그대로 보존한다
        // (동작에 영향이 없으니 지울 이유도 없다 — 기존 프로젝트 데이터 보존).
        kept[state.id] = assetId;
        continue;
      }
      const blob = await getAsset(assetId);
      if (!blob) continue; // 고아 참조(blob 소실) — 이 상태만 조용히 제외해 댕글링을 막는다.
      blobs.set(assetId, blob);
      kept[state.id] = assetId;
    }
    if (Object.keys(kept).length) buttons[slot.id] = kept;
  }

  let logo = mainMenuUi.logo;
  if (logo) {
    const blob = await getAsset(logo);
    if (blob) blobs.set(logo, blob);
    else logo = undefined; // 로고도 같은 규칙 — blob 없으면 "로고 없음"(버튼 없이 프리셋 폴백)으로 취급.
  }

  return { mainMenuUi: { ...mainMenuUi, buttons, logo }, blobs };
}

/**
 * 게임 아이콘 blob 을 생성 전에 확보하고, blob 이 실제로 있는 항목만 남긴다.
 * resolveMainMenuArt/resolveQuickMenuArt 와 같은 이유 + 하나 더: 창 아이콘은 여기서 살아남아야만
 * guiRpy 가 `define gui.window_icon` 을 내보내므로, 이 가지치기가 곧 "참조하면 파일이 있다"는 보장이다.
 */
async function resolveGameIcon(
  gameIcon: Project['gameIcon'],
): Promise<{ gameIcon: Project['gameIcon']; blobs: Map<string, Blob> }> {
  if (!gameIcon) return { gameIcon, blobs: new Map() };
  const blobs = new Map<string, Blob>();
  const kept: NonNullable<Project['gameIcon']> = {};
  for (const which of ['ico', 'window'] as const) {
    const assetId = gameIcon[which];
    if (!assetId) continue;
    const blob = await getAsset(assetId);
    if (!blob) continue; // 고아 참조(blob 소실) — 조용히 빼서 없는 파일 참조를 막는다.
    blobs.set(assetId, blob);
    kept[which] = assetId;
  }
  return { gameIcon: kept, blobs };
}

/**
 * 퀵메뉴 버튼/패널 blob 을 generateRenpyFiles 전에 미리 확보하고, 실제로 blob 이 있는 상태/패널만
 * 남도록 quickMenuUi 를 가지치기한다 — resolveMainMenuArt 와 정확히 같은 패턴(이유도 같다: assetId
 * 는 있는데 blob 이 없는 경우 없는 파일을 참조하는 zip 이 나가 크래시한다). panelWidth/panelHeight
 * 는 blob 을 참조하지 않는 순수 치수값이라 그대로 통과시킨다(패널 자체가 가지치기되면 screensRpy
 * 가 hasPanel=false 로 보고 폴백하므로 치수값이 남아 있어도 무해).
 */
async function resolveQuickMenuArt(
  quickMenuUi: Project['quickMenuUi'],
): Promise<{ quickMenuUi: Project['quickMenuUi']; blobs: Map<string, Blob> }> {
  if (!quickMenuUi) return { quickMenuUi, blobs: new Map() };
  const blobs = new Map<string, Blob>();

  const buttons: Partial<Record<QuickButtonSlot, Partial<Record<QuickButtonState, string>>>> = {};
  for (const slot of QUICK_MENU_SLOTS) {
    const states = quickMenuUi.buttons?.[slot.id];
    if (!states) continue;
    const kept: Partial<Record<QuickButtonState, string>> = {};
    for (const state of QUICK_BUTTON_STATES) {
      const assetId = states[state.id];
      if (!assetId) continue;
      if (!state.renpySupported) {
        // press — 메인 메뉴와 같은 이유로 값은 보존하되(레거시 데이터 무손실) 아래 파일 목록
        // 조립부는 이 상태를 절대 쓰지 않는다.
        kept[state.id] = assetId;
        continue;
      }
      const blob = await getAsset(assetId);
      if (!blob) continue; // 고아 참조(blob 소실) — 이 상태만 조용히 제외해 댕글링을 막는다.
      blobs.set(assetId, blob);
      kept[state.id] = assetId;
    }
    if (Object.keys(kept).length) buttons[slot.id] = kept;
  }

  let panel = quickMenuUi.panel;
  if (panel) {
    const blob = await getAsset(panel);
    if (blob) blobs.set(panel, blob);
    else panel = undefined; // blob 없으면 "패널 없음"(버튼만 표시)으로 안전하게 폴백.
  }

  return { quickMenuUi: { ...quickMenuUi, buttons, panel }, blobs };
}

/** 브라우저 다운로드 트리거. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
