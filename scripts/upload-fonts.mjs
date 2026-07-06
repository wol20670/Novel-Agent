// 폰트 프리셋(왼쪽 패널의 본문/이름 폰트 선택)을 Google Fonts 공식 저장소(OFL 라이선스)에서
// 내려받아 사용자 소유 GCS 공개 버킷에 업로드하고 manifest.json 을 생성한다.
// 앱은 이 manifest.json 목록으로 드롭다운을 채우고, 실제 폰트는 선택 시에만 받아 캐싱한다
// (src/fonts/fontCatalog.ts · fontCache.ts). 폰트 추가는 아래 FONTS 배열에 한 줄 추가 후
// 재실행하면 끝 — 앱 재배포가 필요 없다.
//
// 사전 조건: gcloud/gsutil 설치·인증(`gcloud auth login`), 버킷 생성·공개(uniform + allUsers
// Storage Object Viewer)·CORS 설정 완료(scripts/gcs-fonts-cors.json 참고).
// 사용법: node scripts/upload-fonts.mjs gs://<버킷이름>

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const tmpDir = join(__dirname, '.tmp-fonts');

const bucket = process.argv[2];
if (!bucket || !bucket.startsWith('gs://')) {
  console.error('사용법: node scripts/upload-fonts.mjs gs://<버킷이름>');
  process.exit(1);
}
const bucketDest = bucket.endsWith('/') ? bucket : `${bucket}/`;

const RAW_BASE = 'https://raw.githubusercontent.com/google/fonts/main/ofl';

/**
 * 프리셋 목록. dir/file 은 google/fonts 저장소의 실제 경로(ofl/<dir>/<file>) — 전부 확인됨.
 * 전부 Google Fonts 한글 배치 공식 요건상 현대 한글 11,172자(조합형) 완전 지원 → fullHangul: true.
 * (추후 영문 전용 장식 폰트를 추가하면 그때 false 로 표시해 UI에 "이름·제목 권장" 배지를 띄운다.)
 */
const FONTS = [
  { id: 'gowun-dodum', label: '고운돋움', dir: 'gowundodum', file: 'GowunDodum-Regular.ttf', category: '고딕' },
  { id: 'nanum-myeongjo', label: '나눔명조', dir: 'nanummyeongjo', file: 'NanumMyeongjo-Regular.ttf', category: '명조' },
  { id: 'gowun-batang', label: '고운바탕', dir: 'gowunbatang', file: 'GowunBatang-Regular.ttf', category: '명조' },
  { id: 'song-myung', label: '송명', dir: 'songmyung', file: 'SongMyung-Regular.ttf', category: '명조' },
  { id: 'nanum-pen-script', label: '나눔손글씨 펜', dir: 'nanumpenscript', file: 'NanumPenScript-Regular.ttf', category: '손글씨' },
  { id: 'nanum-brush-script', label: '나눔손글씨 붓', dir: 'nanumbrushscript', file: 'NanumBrushScript-Regular.ttf', category: '손글씨' },
  { id: 'gaegu', label: '개구쟁이', dir: 'gaegu', file: 'Gaegu-Regular.ttf', category: '손글씨' },
  { id: 'poor-story', label: '옛날이야기', dir: 'poorstory', file: 'PoorStory-Regular.ttf', category: '손글씨' },
  { id: 'gamja-flower', label: '감자꽃', dir: 'gamjaflower', file: 'GamjaFlower-Regular.ttf', category: '손글씨' },
  { id: 'jua', label: '주아', dir: 'jua', file: 'Jua-Regular.ttf', category: '둥근' },
  { id: 'yeon-sung', label: '연성', dir: 'yeonsung', file: 'YeonSung-Regular.ttf', category: '둥근' },
  { id: 'black-han-sans', label: '검은고딕', dir: 'blackhansans', file: 'BlackHanSans-Regular.ttf', category: '임팩트' },
  { id: 'do-hyeon', label: '도현', dir: 'dohyeon', file: 'DoHyeon-Regular.ttf', category: '임팩트' },
  { id: 'kirang-haerang', label: '기랑해랑', dir: 'kiranghaerang', file: 'KirangHaerang-Regular.ttf', category: '임팩트' },
  { id: 'east-sea-dokdo', label: '이스트씨독도', dir: 'eastseadokdo', file: 'EastSeaDokdo-Regular.ttf', category: '임팩트' },
  { id: 'gugi', label: '구기', dir: 'gugi', file: 'Gugi-Regular.ttf', category: '임팩트' },
];

async function fetchBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

mkdirSync(tmpDir, { recursive: true });

console.log(`▶ ${FONTS.length}개 폰트 다운로드 중...`);
const manifestFonts = [];
const localFiles = [];
for (const f of FONTS) {
  try {
    const ttf = await fetchBuffer(`${RAW_BASE}/${f.dir}/${f.file}`);
    const ttfPath = join(tmpDir, f.file);
    writeFileSync(ttfPath, ttf);
    localFiles.push(ttfPath);

    const ofl = await fetchBuffer(`${RAW_BASE}/${f.dir}/OFL.txt`);
    const oflPath = join(tmpDir, `${f.id}.OFL.txt`);
    writeFileSync(oflPath, ofl);
    localFiles.push(oflPath);

    manifestFonts.push({ id: f.id, label: f.label, file: f.file, category: f.category, fullHangul: true });
    console.log(`  ✅ ${f.label} (${f.file})`);
  } catch (e) {
    console.warn(`  ❌ ${f.label} 실패 — 건너뜀: ${e.message}`);
  }
}

if (manifestFonts.length === 0) {
  console.error('업로드할 폰트가 하나도 없습니다(전부 다운로드 실패). 중단.');
  rmSync(tmpDir, { recursive: true, force: true });
  process.exit(1);
}

const manifestPath = join(tmpDir, 'manifest.json');
writeFileSync(manifestPath, JSON.stringify({ fonts: manifestFonts }, null, 2));
localFiles.push(manifestPath);

console.log(`▶ ${bucketDest} 에 업로드 중... (gsutil)`);
execFileSync(
  'gsutil',
  ['-m', '-h', 'Cache-Control:public,max-age=604800', 'cp', ...localFiles, bucketDest],
  { stdio: 'inherit', shell: true },
);

rmSync(tmpDir, { recursive: true, force: true });
console.log(`✅ 완료 — ${manifestFonts.length}개 폰트 + manifest.json 업로드됨.`);
