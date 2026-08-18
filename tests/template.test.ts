// 다운로드 양식(.xlsx)이 자기 안내문의 계약을 스스로 지키는지 — focused regression 3종.
// 안내문 문구 자체는 검사하지 않는다(작성법 시트에는 "#베경" 같은 **의도적 오답 예시**가 있어서,
// 모든 #토큰을 태그로 취급하는 일반 검사는 그 예시와 충돌한다).

import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { buildTemplateWorkbook } from '../src/template';
import { parseWorkbook } from '../src/parser';

const wb = buildTemplateWorkbook(XLSX);

/** 스토리 시트의 원본 행(헤더 포함) — 예제 자체를 검사할 때 쓴다. */
function storyRows(): string[][] {
  return XLSX.utils.sheet_to_json<string[]>(wb.Sheets['스토리'], {
    header: 1,
    blankrows: false,
    defval: '',
  });
}

describe('엑셀 양식 템플릿', () => {
  it('첫 번째 시트는 반드시 "스토리" 다 (parseExcel 은 SheetNames[0] 만 읽는다)', () => {
    // 작성법 시트가 앞으로 오면 다운로드 양식이 대본 대신 안내문을 분석시키게 된다.
    expect(wb.SheetNames).toEqual(['스토리', '작성법(읽어보기)']);
  });

  it('스토리 예제가 실제 파서로 그대로 읽힌다(헤더 행은 지문이 되지 않는다)', async () => {
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const { scenes } = await parseWorkbook(buf);

    expect(scenes.map((s) => s.title)).toEqual([
      '맑은 아침, 운동장',
      '밤, 상가거리',
      '배민규와의 대화',
      '안재현과의 대화',
    ]);
    expect(scenes[0].background).toBe('학교 운동장');
    expect(scenes[0].bgm).toBe('morning_breeze');
    expect(scenes[1].cg).toEqual(['두 사람이 마주보는 장면']);
    expect(scenes[1].choices).toHaveLength(2);
    expect(scenes[2].jumpTo).toBe('밤, 상가거리');

    // 안내용 헤더 행("A열 = …" / "B열 = …")이 대사·지문으로 새어 들어오면 안 된다.
    const allText = scenes
      .flatMap((s) => s.lines)
      .map((l) => ('text' in l ? l.text : ''))
      .join('\n');
    expect(allText).not.toMatch(/^[AB]열/m);
  });

  it('예제의 모든 선택지·#점프 대상이 실제 #S 장면 제목과 일치한다', () => {
    const rows = storyRows();
    const titles = new Set<string>();
    const targets: string[] = [];
    for (const row of rows) {
      const body = String(row[1] ?? '').trim();
      if (/^#S\s/i.test(body)) titles.add(body.replace(/^#S\s*/i, '').trim());
      else if (body.startsWith('#점프')) targets.push(body.replace(/^#점프\s*/, '').trim());
      else if (body.startsWith('>') && body.includes('->')) {
        targets.push(body.split('->').slice(1).join('->').trim());
      }
    }
    expect(targets.length).toBeGreaterThan(0);
    // makeResolver 는 trim 후 완전 일치(대소문자 구분)라, 한쪽만 고치면 조용히 다른 장면으로 흘러간다.
    for (const t of targets) expect([...titles]).toContain(t);
  });

  it('예제의 "안재현과의 대화" 표기가 유지된다(옛 오타 "안재현와의 대화" 직접 회귀)', () => {
    // 위 target integrity 검사는 choice 와 #S 가 **양쪽 다** 오타면 통과한다(실제로 그랬다).
    // 그래서 이번에 고친 문자열 자체를 직접 못박는다. 일반 한국어 문법 검사가 아니다.
    const cells = storyRows().flat().map((c) => String(c ?? ''));
    expect(cells.filter((c) => c.includes('안재현와의 대화'))).toEqual([]);
    expect(cells.filter((c) => c.includes('안재현과의 대화'))).toHaveLength(2); // 선택지 1 + #S 1
  });
});
