// 엑셀(.xlsx/.xls) 파서.
// A열 = 화자 이름(있으면 대사), B열 = 대사·지문·태그.
//   - A열 있음            → 대사
//   - A열 없음 + B열 일반  → 지문(나레이션)
//   - A열 없음 + B열 #/>   → 태그·선택지(applyTag 가 처리)
//
// (선택) 별도 시트에 "캐릭터 설정표"를 두면 외형·성격이 자동 적용된다.
//   - 헤더 행에 "이름" + "외형(생김새/외모)" 컬럼이 있는 시트를 자동 인식.
//   - 컬럼: 이름 | 외형 | 성격  (순서 무관, 헤더명으로 매칭)

import * as XLSX from 'xlsx';
import { SceneBuilder, applyTag, type BuildResult } from './sceneBuilder';

type Rows = (string | number | undefined)[][];

const sheetRows = (sheet: XLSX.WorkSheet): Rows =>
  XLSX.utils.sheet_to_json<(string | number | undefined)[]>(sheet, {
    header: 1,
    blankrows: false,
    defval: '',
  });

interface CharSetting {
  appearance?: string;
  personality?: string;
}

const NAME_RE = /^(이름|캐릭터|name)$/i;
const APPEARANCE_RE = /(외형|생김새|외모|appearance|design)/i;
const PERSONALITY_RE = /(성격|역할|설정|personality|role)/i;

/** 시트들에서 "이름+외형" 헤더를 가진 캐릭터 설정표를 찾아 이름→설정 맵을 만든다. */
function readCharacterSettings(wb: XLSX.WorkBook): Map<string, CharSetting> {
  const out = new Map<string, CharSetting>();
  for (const sheetName of wb.SheetNames) {
    const rows = sheetRows(wb.Sheets[sheetName]);
    // 헤더 행 탐색(첫 5행 이내): 이름 컬럼 + 외형 컬럼이 함께 있어야 설정표로 인정.
    let headerIdx = -1;
    let nameCol = -1;
    let appCol = -1;
    let persCol = -1;
    for (let i = 0; i < Math.min(rows.length, 5); i++) {
      const cells = rows[i].map((v) => String(v ?? '').trim());
      const nIdx = cells.findIndex((c) => NAME_RE.test(c));
      const aIdx = cells.findIndex((c) => APPEARANCE_RE.test(c));
      if (nIdx >= 0 && aIdx >= 0) {
        headerIdx = i;
        nameCol = nIdx;
        appCol = aIdx;
        persCol = cells.findIndex((c) => PERSONALITY_RE.test(c));
        break;
      }
    }
    if (headerIdx < 0) continue;
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const cells = rows[i];
      const name = String(cells[nameCol] ?? '').trim();
      if (!name) continue;
      const appearance = String(cells[appCol] ?? '').trim();
      const personality = persCol >= 0 ? String(cells[persCol] ?? '').trim() : '';
      out.set(name, {
        appearance: appearance || undefined,
        personality: personality || undefined,
      });
    }
  }
  return out;
}

export function parseWorkbook(data: ArrayBuffer): BuildResult {
  const wb = XLSX.read(data, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = sheetRows(sheet);

  const b = new SceneBuilder();
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const a = String(row[0] ?? '').trim();
    const col = String(row[1] ?? '').trim();
    if (!a && !col) continue;
    // 양식의 설명용 헤더 행("A열: 화자…" / "B열: 대사…")은 데이터가 아니므로 건너뛴다.
    if (i === 0 && (/^A열/.test(a) || /^B열/.test(col))) continue;

    if (a) {
      // 화자가 있으면 대사 (B열이 비어도 화자 표시만 있는 행은 건너뜀)
      if (col) b.addDialogue(a, col);
      continue;
    }
    // A열 비어있음 → 태그/선택지 우선 시도, 아니면 지문
    if (!applyTag(b, col)) {
      b.addNarration(col);
    }
  }
  const result = b.finish();

  // 캐릭터 설정표(외형·성격)가 있으면 일치하는 캐릭터에 주입.
  const settings = readCharacterSettings(wb);
  if (settings.size) {
    result.characters = result.characters.map((c) => {
      const s = settings.get(c.name);
      return s ? { ...c, appearance: s.appearance ?? c.appearance, personality: s.personality ?? c.personality } : c;
    });
  }
  return result;
}
