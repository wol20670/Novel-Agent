// QA Review Excel round-trip — post-v1 번역 개선 Phase 4-A 의 **순수 포맷 계약**.
//
// Phase 3(qa.ts)이 찾은 **active 의심 번역만** 좁은 전용 workbook 으로 내보내고, 외부(ChatGPT +
// 사용자 소유 전체 대본 Excel)에서 문맥을 보고 고친 파일을 다시 읽어 **적용 가능한 칸만** 골라낸다.
// 이 모듈은 canonical 을 쓰지 않는다 — 실제 write 는 Phase 4-B(store)가 한다.
//
// ⚠️ 이 파일은 **순수**다: 동적 import·Blob·다운로드·file picker·store 접근이 없다(XLSX 는 주입).
//    buildTemplateWorkbook(src/template.ts)과 같은 관용구.
//
// 계약 요약(깨지 말 것):
//  · 사용자-visible 열은 **언어 고정** A=ko · B=en · C=ja · D=검수 대상(**표시 전용**) · E=hidden metadata.
//    행1 헤더는 **structural contract** 라 exact 대조하고, 헤더 이름으로 동적 column mapping 을 만들지 않는다.
//    ⚠️ D열 **헤더**가 format marker 인 것과 D열 **값**이 display-only 인 것은 다른 축이다 —
//       적용 권한(flagged locale)의 authority 는 **오직 hidden metadata 의 f** 다.
//  · 비교는 전부 **exact** 다(Phase 3 anchor 규율). trim 은 **blank 판정에만** 쓰고, candidate 텍스트는
//    사용자가 넣은 **raw 문자열 그대로**다(canonical setter 도 raw 저장이라 semantics 가 일치한다).
//  · 셀은 **strict text cell** 만 인정한다 — 수식(cell.f)·숫자·불리언·날짜·오류 셀을 String() 으로
//    강제 변환해 번역에 넣지 않는다(parseExcel.ts 의 String(row[c] ?? '').trim() 관용구를 재사용하지 말 것).
//  · stale 판정의 정본은 **isQaResultValid 하나**다(새 validity 술어를 만들지 않는다).
//  · 새 persistent identity(Line UUID·hash·checksum·HMAC·revision)를 만들지 않는다 — 위협 모델은
//    **non-adversarial round-trip** 이고, 의도적 metadata 위조는 탐지 대상이 아니다.

import type { CellObject, WorkBook, WorkSheet } from 'xlsx';
import { baseLocaleOf, type Line, type Locale, type Project } from '../../types';
import {
  activeQaIssues,
  isQaResultValid,
  type TranslationQaAnchor,
  type TranslationQaCache,
} from './qa';

/** 호출측이 주입하는 xlsx 모듈(지연 로딩 유지 — 이 파일은 xlsx 를 **값으로** import 하지 않는다). */
type XlsxModule = typeof import('xlsx');

// ── 포맷 상수(writer·reader 공용 단일 소스) ────────────────────────────────────

export const QA_WORKBOOK_MARKER = 'NOVEL_AGENT_QA_REVIEW';
/**
 * 파일 포맷 버전. ⚠️ **문자열 셀**이다 — writer 가 숫자로 쓰면 reader 의 strict text 검사에서
 * structural reject 된다(scalar 타입까지 계약). Project schema/version 과 무관하고 generic
 * migration framework 도 만들지 않는다 — 모르는 값이면 통째로 거절한다.
 */
export const QA_WORKBOOK_VERSION = '1';

export const QA_SHEET_DATA = '번역검수';
export const QA_SHEET_GUIDE = '검수방법(읽어보기)';
export const QA_SHEET_META = '_naqa';
/** 데이터 시트 E1 에 박히는 행-metadata 열 marker. */
export const QA_ROW_MARKER = '__NAQA_ROW__';

/**
 * 표시 열 = **언어 고정**(source/target 순서가 아니다). 이 순서가 계약이다.
 * ⚠️ 헤더 문자열로 열을 찾는 동적 매핑을 만들지 말 것 — A/B/C 고정 narrow format 이다.
 */
export const QA_COLUMN_LOCALES: readonly Locale[] = ['ko', 'en', 'ja'];
/** 검수 대상이 될 수 있는 로케일 — translateTargetsOf 와 같은 정책(ko 는 어떤 base 에서도 target 이 아니다). */
const TARGET_LOCALES: readonly Locale[] = ['en', 'ja'];

const COL_TARGET = QA_COLUMN_LOCALES.length; // D
const COL_META = COL_TARGET + 1; // E

/** 행1 헤더 — **structural contract**(exact 대조, 하나라도 다르면 파일 전체 거절). */
export const QA_HEADER_ROW: readonly string[] = ['한국어', '영어', '일본어', '검수 대상', QA_ROW_MARKER];

// ── 타입 ──────────────────────────────────────────────────────────────────────

/**
 * 내보낼 행 하나 = **한 줄**(sceneId + lineIndex). EN·JA 가 둘 다 의심이어도 행은 하나이고
 * flagged 가 두 값을 갖는다(외부 검수자가 같은 줄을 두 번 보지 않게).
 */
export interface QaWorkbookRow {
  sceneId: string;
  lineIndex: number;
  sourceLocale: Locale;
  /**
   * anchor 의 speaker **그대로**(지문이면 undefined). ⚠️ '' 와 undefined 는 다른 값이고
   * sameQaAnchor 가 exact 비교하므로 임의 정규화하지 않는다.
   */
  speaker: string | undefined;
  narration: boolean;
  /** 적용 권한을 갖는 로케일. 표시 열 순서(en → ja)로 담는다. */
  flagged: Locale[];
  /** export 시점 A/B/C 스냅샷. source·flagged 칸은 anchor 의 raw 문자열 그대로다. */
  values: Record<Locale, string>;
}

export interface QaWorkbookMeta {
  /** export 시점 baseLocale. 행 metadata 의 b 와 일치해야 한다. */
  baseLocale: Locale;
  /** ISO 시각 — 표시·디버그 전용(**검증 authority 아님**). */
  exportedAt: string;
}

/** 셀 하나의 strict 판정. ⚠️ blank 에는 v 가 없다 — 호출측이 '' 로 해석한다(강제 변환이 아니다). */
type QaCell = { kind: 'blank' } | { kind: 'text'; v: string } | { kind: 'invalid' };

/** 구조 검증까지 끝난 원본 행(schema 검증은 analyze 가 한다). */
interface QaRawRow {
  /** 엑셀 행 번호(1-based) — 진단용. */
  excelRow: number;
  /** A/B/C 표시 셀. */
  cells: Record<Locale, QaCell>;
  /** E열 metadata 셀. */
  meta: QaCell;
}

/** structural 검증을 통과한 workbook. 여기까지 왔으면 "QA workbook 인 것은 확실"하다. */
export interface QaWorkbookDoc {
  baseLocale: Locale;
  rows: QaRawRow[];
}

/** 실제로 적용할 칸 하나. */
export interface QaWorkbookCandidate {
  sceneId: string;
  lineIndex: number;
  locale: Locale;
  /** 사용자가 workbook 에 넣은 **raw 문자열 그대로**(analyzer 가 trim 하지 않는다). */
  text: string;
}

/**
 * 확인창·완료 보고용 집계. 단위가 섞이지 않게 이름에 담는다 —
 * badMeta/duplicate/rowMismatch 는 **행**, 나머지는 **칸**이다.
 */
export interface QaWorkbookCounts {
  /** 데이터 행 수(헤더 제외). */
  rows: number;
  /** Pass 3 까지 도달해 실제로 판정된 flagged 칸 수(= candidates + unchanged + blank + stale + invalidCell). */
  flaggedCells: number;
  unchanged: number;
  blank: number;
  stale: number;
  invalidCell: number;
  badMeta: number;
  duplicate: number;
  rowMismatch: number;
  /** 검수 대상이 아닌 칸이 수정된 건수(무시된다 — 사용자 인지용). */
  ignoredEdits: number;
}

export interface QaWorkbookAnalysis {
  candidates: QaWorkbookCandidate[];
  counts: QaWorkbookCounts;
  /** 로케일별 적용 예정 칸 수(확인창 표시용). */
  byLocale: Partial<Record<Locale, number>>;
}

/** schema 검증을 통과한 행 metadata(내부 전용). */
interface QaRowMeta {
  sceneId: string;
  lineIndex: number;
  sourceLocale: Locale;
  speaker: string | undefined;
  narration: boolean;
  flagged: Locale[];
  values: Record<Locale, string>;
}

// ── strict 셀 읽기 ────────────────────────────────────────────────────────────

/**
 * QA 전용 strict text cell reader — **일반 parseExcel 의 coercion 을 재사용하지 않는다.**
 *   셀 없음 / t==='z'            → blank
 *   cell.f 존재(수식)            → invalid   (수식 결과를 번역으로 적용하지 않는다)
 *   t==='s' 이고 v 가 string     → text(raw 그대로)
 *   숫자·불리언·날짜·오류·기타    → invalid
 * ⚠️ String(cell.v) 로 넘겨짚지 말 것 — 그게 이 helper 의 존재 이유다.
 */
function readTextCell(X: XlsxModule, ws: WorkSheet, row: number, col: number): QaCell {
  const cell = ws[X.utils.encode_cell({ r: row, c: col })] as CellObject | undefined;
  if (!cell || cell.t === 'z') return { kind: 'blank' };
  if (cell.f !== undefined) return { kind: 'invalid' };
  if (cell.t === 's' && typeof cell.v === 'string') return { kind: 'text', v: cell.v };
  return { kind: 'invalid' };
}

/** text 셀이면 그 문자열, 아니면 null(헤더·marker 처럼 "정확히 이 문자열" 검사용). */
function textAt(X: XlsxModule, ws: WorkSheet, row: number, col: number): string | null {
  const cell = readTextCell(X, ws, row, col);
  return cell.kind === 'text' ? cell.v : null;
}

/** blank 를 '' 로 해석한 raw 값(invalid 는 null). ⚠️ 이건 blank 의 정의이지 강제 변환이 아니다. */
function rawOf(cell: QaCell): string | null {
  if (cell.kind === 'invalid') return null;
  return cell.kind === 'blank' ? '' : cell.v;
}

// ── export: 대상 수집 ─────────────────────────────────────────────────────────

/** 그 줄의 로케일 값(대사·지문만 번역을 가진다). */
function localeValue(line: Line | undefined, locale: Locale): string {
  if (!line || (line.kind !== 'dialogue' && line.kind !== 'narration')) return '';
  return line.i18n?.[locale] ?? '';
}

/**
 * 지금 화면에 떠 있는 **active 의심 번역**만 행으로 모은다.
 * ⚠️ 대상 판정의 단일 소스는 activeQaIssues 다 — verdict==='review'·isQaResultValid 를
 *    여기서 다시 계산하지 말 것(표시 숫자와 export 내용이 갈라진다).
 * 행 순서 = 장면 순서 → lineIndex 오름차순(결정론).
 */
export function collectQaWorkbookRows(
  project: Pick<Project, 'scenes' | 'baseLocale'>,
  cache: TranslationQaCache,
): QaWorkbookRow[] {
  const sourceLocale = baseLocaleOf(project);
  const rows: QaWorkbookRow[] = [];

  for (const sc of project.scenes) {
    const issues = activeQaIssues(cache[sc.id], sc, sourceLocale);
    if (!issues.length) continue;

    // 같은 줄의 EN·JA 를 한 행으로 묶는다(로케일 → anchor).
    const byLine = new Map<number, Map<Locale, TranslationQaAnchor>>();
    for (const r of issues) {
      const { lineIndex, targetLocale } = r.anchor;
      let m = byLine.get(lineIndex);
      if (!m) {
        m = new Map();
        byLine.set(lineIndex, m);
      }
      // 캐시는 칸 identity 로 upsert 되므로 중복이 없지만, 있어도 먼저 온 값을 유지한다.
      if (!m.has(targetLocale)) m.set(targetLocale, r.anchor);
    }

    for (const lineIndex of [...byLine.keys()].sort((a, b) => a - b)) {
      const anchors = byLine.get(lineIndex)!;
      const flagged = TARGET_LOCALES.filter((l) => anchors.has(l));
      const first = anchors.get(flagged[0]);
      if (!first) continue; // 도달 불가(방어) — flagged 가 비면 행을 만들 이유가 없다
      const line = sc.lines[lineIndex];
      const values = {} as Record<Locale, string>;
      for (const loc of QA_COLUMN_LOCALES) {
        // source 칸과 flagged 칸은 **anchor 의 raw 문자열**이 정본, 나머지는 현재 줄의 값(context-only).
        values[loc] =
          loc === sourceLocale ? first.source : (anchors.get(loc)?.target ?? localeValue(line, loc));
      }
      rows.push({
        sceneId: sc.id,
        lineIndex,
        sourceLocale,
        speaker: first.speaker,
        narration: !!first.narration,
        flagged,
        values,
      });
    }
  }
  return rows;
}

// ── export: workbook 조립 ─────────────────────────────────────────────────────

/**
 * 행 metadata token(E열) — anchor 를 **verbatim** 담는다.
 * ⚠️ p 는 speaker 가 undefined 면 JSON 에서 **키째 빠진다**(부재 vs '' 구분이 계약).
 */
function rowToken(row: QaWorkbookRow): string {
  return JSON.stringify({
    s: row.sceneId,
    i: row.lineIndex,
    b: row.sourceLocale,
    ...(row.speaker !== undefined ? { p: row.speaker } : {}),
    n: row.narration,
    f: row.flagged,
    v: row.values,
  });
}

/** D열 표시값 — **사용자 안내 전용**이고 importer 는 읽지 않는다. */
function flaggedLabel(flagged: Locale[]): string {
  return flagged.map((l) => l.toUpperCase()).join(', ');
}

const GUIDE_LINES: string[][] = [
  ['📖 번역 QA 검수 파일 — 읽고 수정해 주세요'],
  [''],
  ['이 파일은 Novel-Agent 가 "다시 볼 만하다"고 표시한 번역만 모은 검수용 파일입니다.'],
  [''],
  ['1. [번역검수] 시트에서 D열 "검수 대상"에 적힌 언어의 칸만 수정하세요.'],
  ['   · 검수 대상이 아닌 칸(원문 포함)을 고쳐도 앱에서 반영되지 않습니다.'],
  ['   · A열 = 한국어 / B열 = 영어 / C열 = 일본어 로 항상 고정입니다.'],
  ['2. 행이나 열을 추가·삭제하지 마세요. 새로 추가한 행은 무시됩니다.'],
  ['3. 행을 재정렬해야 한다면 반드시 행 전체를 함께 옮기세요.'],
  ['   · 숨은 열을 제외하고 일부 열만 정렬하면 그 행은 안전을 위해 반영되지 않습니다.'],
  ['4. 숨어 있는 열·시트는 앱이 쓰는 정보입니다. 지우거나 고치지 마세요.'],
  ['5. 번역을 빈칸으로 만들지 마세요 — 빈칸은 "삭제"가 아니라 무시로 처리됩니다.'],
  ['   (번역을 지우려면 앱의 장면 카드에서 직접 지우세요.)'],
  ['6. 받은 파일을 그대로(.xlsx) 저장해서 앱의 "QA 반영"으로 다시 가져오세요.'],
  ['   · 값만 복사해 새 파일을 만들면 앱이 읽지 못합니다.'],
  [''],
  ['※ 원문(대본 언어) 칸은 참고용입니다. 원문이 비어 보이는 경우는 그 언어가 이 프로젝트의'],
  ['   번역 대상이 아니라서이며, 정상입니다.'],
  ['※ 이 시트는 안내용이라 앱이 읽지 않습니다.'],
];

/**
 * QA 검수 workbook 조립(순수 — 다운로드는 호출측 몫). 시트 3개:
 *   번역검수(visible) · 검수방법(읽어보기)(visible) · _naqa(hidden marker/version)
 * ⚠️ importer 는 **시트 순서에 의존하지 않는다**(이름 + marker 로 찾는다).
 */
export function buildQaWorkbook(X: XlsxModule, rows: QaWorkbookRow[], meta: QaWorkbookMeta): WorkBook {
  const wb = X.utils.book_new();

  // ── ① 데이터 시트 ──
  const aoa: string[][] = [
    [...QA_HEADER_ROW],
    ...rows.map((r) => [r.values.ko, r.values.en, r.values.ja, flaggedLabel(r.flagged), rowToken(r)]),
  ];
  const wsData = X.utils.aoa_to_sheet(aoa);
  wsData['!cols'] = [
    { wch: 42 },
    { wch: 42 },
    { wch: 42 },
    { wch: 14 },
    { hidden: true }, // E = machine metadata
  ];
  X.utils.book_append_sheet(wb, wsData, QA_SHEET_DATA);

  // ── ② 안내 시트(파서 무시) ──
  const wsGuide = X.utils.aoa_to_sheet(GUIDE_LINES);
  wsGuide['!cols'] = [{ wch: 92 }];
  X.utils.book_append_sheet(wb, wsGuide, QA_SHEET_GUIDE);

  // ── ③ 숨은 marker 시트 ──
  const wsMeta = X.utils.aoa_to_sheet([
    [QA_WORKBOOK_MARKER],
    [QA_WORKBOOK_VERSION], // ⚠️ 문자열 셀
    [meta.baseLocale],
    [meta.exportedAt],
  ]);
  X.utils.book_append_sheet(wb, wsMeta, QA_SHEET_META);
  wb.Workbook = { Sheets: [{ Hidden: 0 }, { Hidden: 0 }, { Hidden: 1 }] };

  return wb;
}

// ── import: 구조 검증 ─────────────────────────────────────────────────────────

function isLocale(v: unknown): v is Locale {
  return v === 'ko' || v === 'en' || v === 'ja';
}

/**
 * marker 만 보는 **얕은** 술어 — "이 파일이 QA 검수용인가"만 답한다(대본 업로드 오용 가드용).
 * ⚠️ 이것으로 import 안전성을 판정하지 말 것. 진짜 검증은 readQaWorkbook 이 한다.
 */
export function isQaWorkbook(X: XlsxModule, wb: WorkBook): boolean {
  const ws = wb.Sheets[QA_SHEET_META];
  return !!ws && textAt(X, ws, 0, 0) === QA_WORKBOOK_MARKER;
}

/** 구조 오류는 전부 예외다(cell 단위 문제와 다른 등급 — 파일 전체를 거절한다). */
function structuralError(msg: string): never {
  throw new Error(`QA 검수 파일이 아니거나 형식이 손상됐습니다 — ${msg}`);
}

/**
 * workbook → 구조 검증된 doc. **structural 검증만** 하고 내용 판정(schema·stale)은 analyze 가 한다.
 *   ① _naqa marker/version/baseLocale  ② 데이터 시트 존재  ③ **행1 헤더 exact 대조**
 *   ④ 셀 단위 수집(sheet_to_json 을 쓰지 않는다 — 수식 여부 cell.f 를 봐야 한다)
 *   ⑤ metadata token 이 하나도 안 읽히면 거절(열이 통째로 사라진 파일)
 */
export function readQaWorkbook(X: XlsxModule, data: ArrayBuffer): QaWorkbookDoc {
  const wb = X.read(data, { type: 'array' });

  const wsMeta = wb.Sheets[QA_SHEET_META];
  if (!wsMeta) structuralError(`숨은 정보 시트(${QA_SHEET_META})가 없습니다`);
  if (textAt(X, wsMeta, 0, 0) !== QA_WORKBOOK_MARKER) structuralError('파일 표식이 없습니다');
  if (textAt(X, wsMeta, 1, 0) !== QA_WORKBOOK_VERSION) {
    structuralError('이 앱이 모르는 QA 파일 형식 버전입니다');
  }
  const baseLocale = textAt(X, wsMeta, 2, 0);
  if (!isLocale(baseLocale)) structuralError('원문 언어 정보가 손상됐습니다');

  const ws = wb.Sheets[QA_SHEET_DATA];
  if (!ws) structuralError(`데이터 시트(${QA_SHEET_DATA})가 없습니다`);

  // 헤더는 structural contract 다 — 열이 뒤바뀐 파일(예: 영어/일본어 열 교체)을 여기서 막는다.
  // ⚠️ 헤더 문자열로 열을 다시 찾는 동적 매핑을 만들지 말 것(고정 narrow format).
  for (let c = 0; c < QA_HEADER_ROW.length; c++) {
    if (textAt(X, ws, 0, c) !== QA_HEADER_ROW[c]) {
      structuralError(`첫 행의 열 제목이 다릅니다(${QA_HEADER_ROW[c]} 열)`);
    }
  }

  const ref = ws['!ref'];
  const range = ref ? X.utils.decode_range(ref) : { s: { r: 0, c: 0 }, e: { r: 0, c: 0 } };
  const rows: QaRawRow[] = [];
  let parseable = 0;
  for (let r = 1; r <= range.e.r; r++) {
    const cells = {} as Record<Locale, QaCell>;
    for (let c = 0; c < QA_COLUMN_LOCALES.length; c++) {
      cells[QA_COLUMN_LOCALES[c]] = readTextCell(X, ws, r, c);
    }
    const target = readTextCell(X, ws, r, COL_TARGET); // D — 표시 전용(권한 판정에 쓰지 않는다)
    const meta = readTextCell(X, ws, r, COL_META);
    const allBlank =
      meta.kind === 'blank' &&
      target.kind === 'blank' &&
      QA_COLUMN_LOCALES.every((l) => cells[l].kind === 'blank');
    if (allBlank) continue; // 빈 행은 데이터가 아니다
    if (meta.kind === 'text') {
      try {
        JSON.parse(meta.v);
        parseable += 1;
      } catch {
        /* schema 검증은 analyze 가 한다 — 여기선 "열이 살아 있는가"만 센다 */
      }
    }
    rows.push({ excelRow: r + 1, cells, meta });
  }
  // 데이터 행이 있는데 metadata 가 하나도 안 읽히면 숨은 열이 통째로 사라진 파일이다.
  if (rows.length > 0 && parseable === 0) structuralError('숨은 정보 열이 지워졌습니다');

  return { baseLocale, rows };
}

// ── import: 행 metadata schema 검증 ───────────────────────────────────────────

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * 행 metadata 를 **fail-closed** 로 검증한다 — 하나라도 어긋나면 그 행 전체를 버린다(null).
 * ⚠️ 특히 f 는 **적용 권한 그 자체**라 부분 복구를 하지 않는다(["en","unknown"] 에서 en 만
 *    살리지 않는다). ⚠️ speaker/narration 의 논리 정합성(지문인데 화자가 있다 등)은 여기서
 *    판정하지 않는다 — 그건 isQaResultValid 가 anchor exact 비교로 자연히 처리한다.
 */
function parseRowMeta(cell: QaCell, workbookBase: Locale): QaRowMeta | null {
  if (cell.kind !== 'text') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(cell.v);
  } catch {
    return null;
  }
  if (!isPlainObject(parsed)) return null;

  const { s, i, b, n, f, v } = parsed;
  if (typeof s !== 'string' || !s) return null;
  if (typeof i !== 'number' || !Number.isInteger(i) || i < 0) return null;
  if (!isLocale(b) || b !== workbookBase) return null;
  if (typeof n !== 'boolean') return null;

  // p: 키 부재 → undefined, 키 존재 → 반드시 string('' 도 그대로 보존)
  let speaker: string | undefined;
  if ('p' in parsed) {
    if (typeof parsed.p !== 'string') return null;
    speaker = parsed.p;
  }

  if (!Array.isArray(f) || f.length === 0) return null;
  const flagged: Locale[] = [];
  for (const el of f as unknown[]) {
    if (el !== 'en' && el !== 'ja') return null; // 허용 target 만
    if (el === b) return null; // 원문 언어는 검수 대상이 될 수 없다
    if (flagged.includes(el)) return null; // 중복 금지
    flagged.push(el);
  }

  // v: ko/en/ja **세 값 모두** string 이어야 한다 — 그래야 A/B/C 전 열에서 exact 비교가 정의된다.
  if (!isPlainObject(v)) return null;
  const values = {} as Record<Locale, string>;
  for (const loc of QA_COLUMN_LOCALES) {
    const val = v[loc];
    if (typeof val !== 'string') return null;
    values[loc] = val;
  }

  return { sceneId: s, lineIndex: i, sourceLocale: b, speaker, narration: n, flagged, values };
}

/** 행 identity — 구분자 문자를 박지 않으려고 JSON 배열을 쓴다(qaCellKey 와 같은 이유). */
function rowIdentity(meta: QaRowMeta): string {
  return JSON.stringify([meta.sceneId, meta.lineIndex]);
}

// ── import: 3-pass 분석 ───────────────────────────────────────────────────────

/**
 * workbook + 현재 project → **적용해도 안전한 칸**과 그 이유별 집계.
 *
 * 순수·결정론이라 preview 와 실제 커밋이 **같은 함수**를 부른다(planner parity) — 커밋 직전
 * 현재 scenes 로 다시 부르면 그 사이 바뀐 칸만 stale 로 빠진다.
 *
 * 3-pass 인 것이 계약이다:
 *   Pass 1 schema 검증 → 실패 행은 **duplicate 계산에도 참여하지 않는다**
 *          (malformed {"i":"12"} 가 정상 {"i":12} 행을 duplicate 로 오염시키면 안 된다)
 *   Pass 2 schema-valid 행끼리만 identity group → 충돌하면 **전부 폐기**(last-wins 금지)
 *   Pass 3 원문 열 정합성 → 로케일별 판정
 * 로케일 판정 순서도 계약이다: invalid → **exact** unchanged → whitespace-only blank → stale → candidate.
 */
export function analyzeQaWorkbook(
  doc: QaWorkbookDoc,
  project: Pick<Project, 'scenes' | 'baseLocale'>,
): QaWorkbookAnalysis {
  const sourceLocale = baseLocaleOf(project);
  const sceneMap = new Map(project.scenes.map((sc) => [sc.id, sc]));
  const counts: QaWorkbookCounts = {
    rows: doc.rows.length,
    flaggedCells: 0,
    unchanged: 0,
    blank: 0,
    stale: 0,
    invalidCell: 0,
    badMeta: 0,
    duplicate: 0,
    rowMismatch: 0,
    ignoredEdits: 0,
  };
  const candidates: QaWorkbookCandidate[] = [];
  const byLocale: Partial<Record<Locale, number>> = {};

  // ── Pass 1 — metadata schema 검증 ──
  const valid: { raw: QaRawRow; meta: QaRowMeta }[] = [];
  for (const raw of doc.rows) {
    const meta = parseRowMeta(raw.meta, doc.baseLocale);
    if (!meta) {
      counts.badMeta += 1;
      continue;
    }
    valid.push({ raw, meta });
  }

  // ── Pass 2 — duplicate identity(= schema-valid 행끼리만) ──
  const seen = new Map<string, number>();
  for (const { meta } of valid) {
    const key = rowIdentity(meta);
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }

  // ── Pass 3 — 원문 정합성 + 로케일 판정 ──
  for (const { raw, meta } of valid) {
    if ((seen.get(rowIdentity(meta)) ?? 0) > 1) {
      // ⚠️ 나중에 rowMismatch 가 될 행이 섞여 있어도 "살아남을 쪽"을 고르지 않는다(보수적 폐기).
      counts.duplicate += 1;
      continue;
    }

    // 원문 칸은 수정 대상이 아니다 — 다르면 그 행은 visible/hidden 이 어긋난 것으로 보고 통째로 버린다
    // (숨은 열을 뺀 부분 정렬로 metadata 가 다른 줄에 붙는 사고를 여기서 막는다).
    const sourceRaw = rawOf(raw.cells[meta.sourceLocale]);
    if (sourceRaw === null || sourceRaw !== meta.values[meta.sourceLocale]) {
      counts.rowMismatch += 1;
      continue;
    }

    for (const loc of QA_COLUMN_LOCALES) {
      if (loc === meta.sourceLocale) continue; // 원문 열은 위에서 이미 처리했다
      const cell = raw.cells[loc];
      const snapshot = meta.values[loc];

      // 권한의 authority 는 **metadata f 뿐**이다 — D열 표시값을 읽지 않는다.
      if (!meta.flagged.includes(loc)) {
        if (cell.kind === 'text' && cell.v !== snapshot) counts.ignoredEdits += 1;
        continue;
      }

      counts.flaggedCells += 1;
      if (cell.kind === 'invalid') {
        counts.invalidCell += 1; // 수식·숫자 등 — 강제 변환해서 넣지 않는다
        continue;
      }
      const text = cell.kind === 'blank' ? '' : cell.v;
      if (text === snapshot) {
        counts.unchanged += 1; // **exact** 비교(trim 금지)
        continue;
      }
      if (text.trim().length === 0) {
        counts.blank += 1; // 빈칸은 삭제가 아니라 무시다
        continue;
      }
      const anchor: TranslationQaAnchor = {
        sceneId: meta.sceneId,
        lineIndex: meta.lineIndex,
        sourceLocale: meta.sourceLocale,
        targetLocale: loc,
        source: meta.values[meta.sourceLocale],
        target: snapshot,
        speaker: meta.speaker,
        narration: meta.narration,
      };
      if (!isQaResultValid(anchor, sceneMap.get(meta.sceneId), sourceLocale)) {
        counts.stale += 1;
        continue;
      }
      candidates.push({ sceneId: meta.sceneId, lineIndex: meta.lineIndex, locale: loc, text });
      byLocale[loc] = (byLocale[loc] ?? 0) + 1;
    }
  }

  return { candidates, counts, byLocale };
}
