// 태그 사전 동기화: Google Sheet(원본) → src/generators/image/tagDictionary.ts(앱이 읽는 사본).
//
// 사용법:
//   npm run sync:tags          # 시트를 읽어 tagDictionary.ts 의 @generated 블록을 덮어씀
//   npm run sync:tags -- --dry # 덮어쓰지 않고 결과만 출력(검증용)
//   node scripts/sync-tags.mjs --soft # 실패해도 exit 0(오프라인에서 dev 가 멈추지 않게 — predev 용)
//
// 권한: 시트가 "링크가 있는 모든 사용자 → 뷰어" 면 충분(편집권 불필요). 키/인증 없음.
// 시트 구조(권장): [한국어(동의어는 / 로 구분) | 영문 태그 | 카테고리] — 헤더 1줄.
//   (헤더가 중간에 반복되거나 "교복 (세일러복)" 같은 괄호 동의어도 관용적으로 파싱한다.)

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// 시트 ID(공유 "링크 뷰어" 시트는 비밀이 아니므로 코드에 둬도 무방). 다른 시트로 바꾸려면 SHEET_ID 환경변수.
const SHEET_ID = process.env.SHEET_ID || '1D159kXhntNGz_-cfPN9K6VSmwFpQr77Ki2jWBoFNAug';
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv`;
// 표준 11개 카테고리(정렬·오타 경고용). 시트에 새 카테고리를 추가해도 동기화는 된다(아래 참고).
const CATEGORIES = [
  'Subject', 'Body', 'Expression', 'Pose', 'Clothing', 'Accessory',
  'Scene', 'LightFX', 'Style', 'Camera', 'Quality',
];

const here = dirname(fileURLToPath(import.meta.url));
const TARGET = resolve(here, '../src/generators/image/tagDictionary.ts');
const DRY = process.argv.includes('--dry');
const SOFT = process.argv.includes('--soft'); // 실패를 경고로만 처리(dev 부팅 차단 방지)

/** 따옴표/쉼표/개행을 처리하는 최소 CSV 파서 → 행(셀 배열)들. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else q = false;
      } else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\r') { /* skip */ }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/**
 * 영문 태그 정규화 → NovelAI 공식 권장(띄어쓰기). 단, 이모티콘 표정 태그(^_^, o_o, >_<, 0_0 …)는
 * 언더바가 의미라서 보존한다. "긴 영단어_단어"(long_hair, two-tone_hair) 형태만 공백으로 바꾼다.
 */
function normalizeEn(s) {
  return s
    .split(',')
    .map((t) => {
      t = t.trim();
      if (!t.includes('_')) return t;
      const parts = t.split('_');
      const wordy = parts.every((p) => /^[a-z0-9-]+$/i.test(p)) && parts.some((p) => p.length >= 3);
      return wordy ? parts.join(' ').replace(/\s+/g, ' ') : t; // 이모티콘 등은 그대로
    })
    .filter(Boolean)
    .join(', ');
}

// 한국어 칸에 섞인 "메모(주석)" 판별 → 동의어로 오인되지 않게 자동 제외.
// (예: "NAI V2부터 제외", "권장하지 않음", "v3 전용" …) 실제 태그 의미어는 이런 단어를 안 쓴다.
const NOTE_RE = /제외|권장|주의|참고|금지|않음|안\s?함|더\s?이상|deprecated|구버전|\bNAI\b|v?\d+(?:\.\d+)?\s*(?:부터|전용|이상|이하)/i;
const isNote = (s) => NOTE_RE.test(s);

/** "교복 (세일러복)" / "넥타이 / 리본" → ['교복','세일러복'] / ['넥타이','리본'] (메모 토큰 제거) */
function parseKo(cell) {
  const out = [];
  // 동의어 구분자: '/' 권장이지만 현행 시트의 ',' 도 관용 처리(ko 열엔 한 의미에 쉼표가 없음).
  for (let piece of cell.split(/[/,]/)) {
    piece = piece.trim();
    const m = piece.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
    if (m) { if (m[1].trim()) out.push(m[1].trim()); if (m[2].trim()) out.push(m[2].trim()); }
    else if (piece) out.push(piece);
  }
  return out.filter((k) => !isNote(k));
}

const esc = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

async function main() {
  const res = await fetch(CSV_URL);
  if (!res.ok) {
    await res.arrayBuffer().catch(() => {}); // 소켓을 비워 정상 종료(미소비 시 Windows 종료 어서션).
    if (res.status === 401 || res.status === 403) {
      throw new Error(`시트 접근 거부(HTTP ${res.status}). 공유 설정을 "링크가 있는 모든 사용자 → 뷰어"로 바꾸세요.`);
    }
    throw new Error(`시트 CSV 내려받기 실패: HTTP ${res.status}`);
  }
  const text = await res.text();
  if (/<html/i.test(text)) {
    throw new Error('CSV 대신 HTML 이 왔습니다(보통 비공개 시트). 공유를 "링크 뷰어"로 바꾸세요.');
  }

  const rows = parseCsv(text);
  const entries = [];
  const warnings = [];
  for (const r of rows) {
    const ko = (r[0] || '').trim();
    const en = (r[1] || '').trim();
    const cat = (r[2] || '').trim();
    if (!ko || !en) continue;                 // 빈 줄/구분 줄
    if (ko === '한국어 의미' || ko.startsWith('한국어')) continue; // 헤더(반복 포함)
    if (!cat) { warnings.push(`카테고리 빈칸 (행: ${ko}) → 건너뜀`); continue; }
    if (!CATEGORIES.includes(cat)) {
      // 새 카테고리는 그대로 포함한다(드롭하지 않음). 오타일 수도 있으니 알림만.
      warnings.push(`낯선 카테고리 "${cat}" (행: ${ko}) — 포함함(오타가 아닌지 확인)`);
    }
    entries.push({ ko: parseKo(ko), en: normalizeEn(en), cat });
  }

  if (!entries.length) throw new Error('파싱된 태그가 0개입니다. 시트 구조를 확인하세요.');

  // 카테고리 순서대로 정렬(낯선 카테고리는 끝으로) + 섹션 주석.
  const catRank = (c) => { const i = CATEGORIES.indexOf(c); return i < 0 ? CATEGORIES.length : i; };
  entries.sort((a, b) => catRank(a.cat) - catRank(b.cat));
  const lines = [];
  let curCat = '';
  for (const e of entries) {
    if (e.cat !== curCat) { lines.push(`  // ${e.cat}`); curCat = e.cat; }
    const koArr = e.ko.map((k) => `'${esc(k)}'`).join(', ');
    lines.push(`  { ko: [${koArr}], en: '${esc(e.en)}', cat: '${e.cat}' },`);
  }
  const body = lines.join('\n');

  for (const w of warnings) console.warn('⚠ ', w);
  console.log(`✓ ${entries.length}개 태그 파싱 완료 (${SHEET_ID})`);

  if (DRY) {
    console.log('\n--- @generated 블록 미리보기 (--dry, 파일 미수정) ---\n');
    console.log(body);
    return;
  }

  const src = readFileSync(TARGET, 'utf8');
  const re = /(\n {2}\/\/ @generated:start\n)[\s\S]*?(\n {2}\/\/ @generated:end\n)/;
  if (!re.test(src)) throw new Error('@generated 마커를 찾지 못했습니다(tagDictionary.ts).');
  const next = src.replace(re, `$1${body}$2`);
  writeFileSync(TARGET, next, 'utf8');
  console.log(`✓ 갱신: ${TARGET}`);
  console.log('  (typecheck 권장: npm run typecheck)');
}

main().catch((e) => {
  if (SOFT) {
    // 오프라인 등 — dev 부팅을 막지 않는다. process.exit() 대신 exitCode 만 두어
    // 남은 비동기 핸들이 자연히 닫힌 뒤 종료(Windows libuv 종료 어서션 회피).
    console.warn(`⚠ 태그 동기화 건너뜀(기존 사전 사용): ${e.message}`);
    process.exitCode = 0;
    return;
  }
  console.error('✗', e.message);
  process.exitCode = 1;
});
