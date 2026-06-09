import * as XLSX from 'xlsx';
import { parseWorkbook } from '../src/parser/parseExcel';

// 사용자가 준 엑셀 예시를 AOA로 재현
const aoa = [
  ['', '#S 맑은 아침, 운동장'],
  ['', '#배경 학교 운동장'],
  ['주인공', '안녕하세요.'],
  ['상대방', '만나서 반가워요.'],
  ['', '잠시 침묵이 흘렀다.'],
  ['', '#BGM piano_soft'],
  ['', ''],
  ['', '#S 밤, 상가거리'],
  ['', '#CG 포옹 장면'],
  ['', '#연출 슬로우 줌인'],
  ['', '> 배민규 -> 배민규와의 대화'],
  ['', '> 안재현 -> 안재현와의 대화'],
  ['', '#S 배민규와의 대화'],
  ['배민규', '저를 선택해주셨군요.'],
  ['', '#점프 밤, 상가거리'],
];
const ws = XLSX.utils.aoa_to_sheet(aoa);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'S');
const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
const { scenes, characters } = parseWorkbook(buf as ArrayBuffer);
console.log('장면:', scenes.length, '| 캐릭터:', characters.map(c=>c.name).join(','));
for (const s of scenes) console.log(` "${s.title}" bg=${s.background??'-'} bgm=${s.bgm??'-'} 대사=${s.lines.length} CG=${s.cg.length} 선택지=${s.choices.length} 점프=${s.jumpTo??'-'}`);
const ok = scenes.length===3 && scenes[0].bgm==='piano_soft' && scenes[1].choices.length===2 && scenes[2].jumpTo==='밤, 상가거리';
console.log(ok ? '✅ 엑셀 A/B열 파싱 정상' : '❌ 엑셀 파싱 이상');
