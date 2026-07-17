import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseWorkbook } from '../src/parser';

/** aoa(2차원 배열) → parseWorkbook 가 읽는 ArrayBuffer 로 변환(첫 시트만 읽으므로 시트 하나면 충분). */
function toBuffer(rows: (string | number)[][]): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, '스토리');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

describe('parseWorkbook: 콜론형(장면:/배경: ...) 필드 태그 인식', () => {
  it('콜론형 태그가 새 장면·배경으로 인식된다(엑셀 B열)', async () => {
    const buf = toBuffer([
      ['', '장면: 교실'],
      ['', '배경: 창가'],
      ['철수', '안녕'],
      ['', '장면: 옥상'],
    ]);
    const { scenes } = await parseWorkbook(buf);
    expect(scenes).toHaveLength(2);
    expect(scenes[0].title).toBe('교실');
    expect(scenes[0].background).toBe('창가');
    expect(scenes[1].title).toBe('옥상');
  });

  it('소문자 원시 태그 "#s 교실" 도 장면을 연다', async () => {
    const buf = toBuffer([['', '#s 교실']]);
    const { scenes } = await parseWorkbook(buf);
    expect(scenes).toHaveLength(1);
    expect(scenes[0].title).toBe('교실');
  });

  it('회귀: 대문자 "#S 교실"·"#장면 교실"은 여전히 동작한다', async () => {
    const bufS = toBuffer([['', '#S 교실']]);
    const { scenes: scenesS } = await parseWorkbook(bufS);
    expect(scenesS[0].title).toBe('교실');

    const bufJangmyeon = toBuffer([['', '#장면 교실']]);
    const { scenes: scenesJ } = await parseWorkbook(bufJangmyeon);
    expect(scenesJ[0].title).toBe('교실');
  });

  it('단독 "선택지:" 행은 지문이 되지 않고, 뒤이은 "> 선택A"는 여전히 선택지가 된다', async () => {
    const buf = toBuffer([
      ['', '#S 교실'],
      ['철수', '뭘 고를까?'],
      ['', '선택지:'],
      ['', '> 선택A'],
    ]);
    const { scenes } = await parseWorkbook(buf);
    const narrations = scenes[0].lines.filter((l) => l.kind === 'narration');
    expect(narrations.some((l) => 'text' in l && /선택지/.test(l.text))).toBe(false);
    expect(scenes[0].choices.map((c) => c.text)).toEqual(['선택A']);
  });

  it('회귀: C/D열 번역 검수본이 여전히 i18n으로 들어간다', async () => {
    const buf = toBuffer([
      ['', '#S 교실'],
      ['철수', '안녕', 'Hello', 'こんにちは'],
    ]);
    const { scenes } = await parseWorkbook(buf);
    const line = scenes[0].lines[0];
    expect(line.kind).toBe('dialogue');
    expect(line.i18n).toEqual({ en: 'Hello', ja: 'こんにちは' });
  });
});
