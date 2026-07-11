// Ren'Py 프로젝트 ZIP 패키징.
// 텍스트 .rpy 는 generate.ts, 바이너리는 IndexedDB 의 생성 에셋을 쓰되
// 아직 생성되지 않은 배경/CG/BGM 은 즉석 폴백(Canvas/합성)으로 채워 실행 가능한 ZIP 을 보장한다.

import type { Project } from '../types';
import { effectiveTextLocales, effectiveVoiceLocales } from '../types';
import { generateRenpyFiles, resolveItems, charIdMap, voiceBaseName, extFromMime } from '../renpy/generate';
import { getAsset } from '../storage/assetStore';
import { canvasImage } from '../generators/image/canvasProvider';
import { canvasSprite } from '../generators/image/canvasSprite';
import { canvasMenuArt, solidPng, buttonBgAssets, textboxGradientPng, roundedPillPng, quickPillAssets } from '../generators/image/canvasMenu';
import { resolveTheme } from '../renpy/gui';
import { loadFontCatalog, fontById, DEFAULT_FONT } from '../fonts/fontCatalog';
import { ensureFontBlob, ensureFontLicense } from '../fonts/fontCache';

async function blobForBackground(
  assetId: string | undefined,
  prompt: string,
  label: string,
  w: number,
  h: number,
): Promise<Blob> {
  if (assetId) {
    const existing = await getAsset(assetId);
    if (existing) return existing;
  }
  return canvasImage(prompt, label, w, h);
}

// BGM 은 이제 업로드본만 있다(생성 폴백 없음) — generate.ts 가 bgmAssetId 없는 장면은
// bgmFile 자체를 만들지 않으므로, 여기 도달하는 항목은 항상 assetId 를 가진다(방어적으로만 체크).
async function blobForBgm(assetId: string | undefined): Promise<Blob | undefined> {
  return assetId ? getAsset(assetId) : undefined;
}

export interface ZipResult {
  blob: Blob;
  filename: string;
  /** 폴백으로 즉석 생성된 에셋 수(사용자 안내용). */
  placeholders: number;
}

/** Ren'Py 프로젝트의 모든 파일(텍스트+바이너리). path 는 프로젝트 루트 기준. */
export interface ProjectFile {
  path: string;
  data: string | Blob;
}

/**
 * 프로젝트의 전체 파일 목록을 수집한다(ZIP·폴더 직접쓰기 공용).
 * 미생성 배경/CG/BGM 은 폴백으로 채우고, 한글 폰트도 포함한다.
 */
export async function collectProjectFiles(
  project: Project,
): Promise<{ files: ProjectFile[]; placeholders: number }> {
  // generateRenpyFiles 가 gui.rpy 를 만들며 폰트 경로(fontGamePath)를 동기로 조회하므로, 그 전에
  // 매니페스트를 반드시 채워둬야 한다 — 안 그러면 커스텀 폰트를 골랐어도 카탈로그가 비어 있어
  // 조용히 기본 폰트 경로로 생성되고, 뒤의 selectedFontFiles 는 카탈로그가 찬 뒤라 실제 커스텀
  // 폰트 파일을 번들해서 gui.rpy 와 game/fonts/ 내용이 서로 어긋나는 버그가 있었음.
  await loadFontCatalog();
  const { files: textFiles, refs, sprites } = generateRenpyFiles(project);
  const out: ProjectFile[] = textFiles.map((f) => ({ path: f.path, data: f.content }));

  let placeholders = 0;

  // 캐릭터 스프라이트 (생성된 assetId → blob, 없으면 Canvas 폴백)
  for (const sp of sprites) {
    let blob = sp.assetId ? await getAsset(sp.assetId) : undefined;
    if (!blob) {
      const color = project.characters.find((c) => c.name === sp.charName)?.color ?? '#9fd3ff';
      blob = await canvasSprite(sp.charName, sp.expr, color);
      placeholders++;
    }
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
    const had = !!p.assetId && !!(await getAsset(p.assetId));
    const bg = await blobForBackground(p.assetId, p.prompt, p.label, project.width, project.height);
    if (!had) placeholders++;
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
  for (const job of voiceJobs) {
    const blob = await getAsset(job.assetId);
    if (!blob) continue; // 없으면 건너뜀(vo() 가 무음 폴백)
    const ext = extFromMime(blob.type);
    out.push({ path: `game/voices/${job.locale}/${job.base}.${ext}`, data: blob });
  }

  // 아이템(소품) 팝업 이미지 — 이름 기준 공유. assetId 있으면 그 blob, 없으면 Canvas placeholder.
  for (const it of resolveItems(project)) {
    const up = it.assetId ? await getAsset(it.assetId) : null;
    const blob = up ?? (await canvasImage(it.name, `아이템: ${it.name}`, 512, 512));
    if (!up) placeholders++;
    out.push({ path: `game/images/${it.file}`, data: blob });
  }

  // 자체 GUI 메뉴 배경(테마별 Canvas 생성) — gui.rpy 가 참조하는 유일한 그림.
  const theme = resolveTheme(project.genre, project.guiTheme);
  // 업로드한 메뉴 배경이 있으면 그것을, 없으면 Canvas 생성본을 쓴다.
  const menuArtFor = async (which: 'main' | 'game'): Promise<Blob> => {
    const upId = project.menuArt?.[which];
    if (upId) {
      const up = await getAsset(upId);
      if (up) return up;
    }
    placeholders += 1;
    return canvasMenuArt(theme, project.width, project.height, which);
  };
  out.push({ path: 'game/gui/main_menu.png', data: await menuArtFor('main') });
  out.push({ path: 'game/gui/game_menu.png', data: await menuArtFor('game') });

  // 버튼 배경 PNG(gui.button_properties 요구) — 제네릭 prefix 세트.
  for (const b of buttonBgAssets(theme)) {
    out.push({ path: `game/gui/button/${b.name}`, data: await solidPng(b.color) });
  }

  // 퀵메뉴(우상단 드롭다운) 알약 배경 — 제네릭 버튼 배경(투명)을 quick_button 스타일에서만
  // 덮어써 가독성을 확보한다(screensRpy.ts 의 style quick_button 참고).
  for (const p of quickPillAssets(theme)) {
    out.push({ path: `game/gui/${p.name}`, data: await roundedPillPng(p.fill, p.border) });
  }

  // 대사창 그라데이션(투명) 켜짐 → 세로 그라데이션 텍스트박스 PNG 생성(색·불투명도는 사용자 조정값).
  if (project.guiOverrides?.dialogueGradient) {
    const boxColor = project.guiOverrides.dialogueBoxColor ?? '#000000';
    // 기본 0.40 — 그라데이션 하단이 이 정도는 진해야 배경 위 글자 대비가 확보된다(패널 표시값과 일치).
    const maxAlpha = project.guiOverrides.dialogueOpacity ?? 0.4;
    out.push({ path: 'game/gui/textbox.png', data: await textboxGradientPng(boxColor, maxAlpha) });
  }

  // 한글 폰트 — Ren'Py 기본 폰트는 한글 글리프가 없다. 선택한 본문/이름 폰트(기본은 나눔고딕)를
  // game/fonts/ 에 번들. 일본어(자막·음성 어느 쪽이든) 프로젝트에서만 Source Han Sans(≈2.9MB)도
  // 함께 번들한다. gui.rpy(guiRpy)의 JP 폰트 참조 조건과 반드시 일치해야 한다(같은 규칙: ja ∈ text|voice).
  const japanese =
    effectiveTextLocales(project).includes('ja') || effectiveVoiceLocales(project).includes('ja');
  const fontResult = await selectedFontFiles(project.guiOverrides, japanese);
  placeholders += fontResult.placeholders;
  for (const f of fontResult.files) out.push(f);

  return { files: out, placeholders };
}

export async function buildRenpyZip(project: Project): Promise<ZipResult> {
  const { default: JSZip } = await import('jszip'); // 지연 로딩(초기 번들 경량화)
  const { files, placeholders } = await collectProjectFiles(project);
  const zip = new JSZip();
  for (const f of files) zip.file(f.path, f.data);

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  const safeName = (project.title || 'visual-novel').replace(/[^\w가-힣-]+/g, '_').slice(0, 40);
  return { blob, filename: `${safeName}_renpy.zip`, placeholders };
}

/**
 * 선택한 본문/이름 폰트(왼쪽 패널 GUI 설정, 기본은 나눔고딕 번들) + (일본어 프로젝트면)
 * SourceHanSansLite 를 game/fonts/ 에 넣을 파일 목록으로 만든다.
 * - 나눔고딕: 한글·라틴 본문(Ren'Py 기본 폰트는 한글 글리프 없음) — 본문/이름 어느 한쪽이라도 기본
 *   폰트를 쓰면(bodyFontId 미지정이 기본) 나눔고딕과 public/fonts/OFL.txt 를 함께 포함한다.
 * - SourceHanSansLite: 일본어(かな·한자) 자막/UI 용. gui.rpy 의 FontGroup 이 일본어 범위만 이 폰트로
 *   폴백한다(나눔고딕은 일본어 글리프가 없어 자막이 빈칸으로 나오는 문제 대응). 둘 다 SIL OFL 1.1.
 * - 커스텀(GCS) 폰트 다운로드 실패 시 기본 폰트로 자동 폴백(오프라인에도 항상 실행 가능한 zip 보장) —
 *   이 경우 placeholders 카운트를 올려 호출 측 토스트("임시 에셋 N개 포함")에 반영한다.
 */
async function selectedFontFiles(
  guiOverrides: Project['guiOverrides'],
  includeJapanese: boolean,
): Promise<{ files: ProjectFile[]; placeholders: number }> {
  // 호출 측(collectProjectFiles)이 gui.rpy 생성 전에 이미 로드해두지만, 이 함수만 독립 호출될 가능성도
  // 방어(loadFontCatalog 는 캐시돼 있으면 즉시 반환이라 비용 없음).
  await loadFontCatalog();

  // bodyFontId 미지정이어도 실제로는 기본 폰트가 쓰이므로(theme.ts withGuiOverrides), 여기서도
  // 항상 기본 폰트를 wanted 에 포함시켜야 gui.rpy 가 참조하는 파일과 번들 내용이 일치한다.
  const bodyId = guiOverrides?.bodyFontId ?? DEFAULT_FONT.id;
  const nameId = guiOverrides?.nameFontId ?? bodyId;
  const wanted = [...new Set([bodyId, nameId])].map((id) => fontById(id));

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
      return { actual, blob, license, placeholder };
    }),
  );

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

  return { files, placeholders };
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
