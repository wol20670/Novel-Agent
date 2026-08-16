// 실제 브라우저(헤드리스 Chromium)로 전체 파이프라인을 클릭 검증한다.
// 샘플 → 분석 → 전체 승인 → 배경/BGM/스프라이트 업로드(픽스처 파일) → Ren'Py 확인 → ZIP 다운로드 → 내용물 검증.
// 이미지·음악은 이제 앱이 생성하지 않으므로(ChatGPT/Suno 등 외부 도구 → 업로드), 여기선 작은 픽스처
// 파일을 업로드 버튼의 숨김 input 에 직접 주입해 업로드 경로를 검증한다.
import { chromium } from 'playwright';
import JSZip from 'jszip';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const shotDir = join(root, 'e2e-shots');
mkdirSync(shotDir, { recursive: true });

// 업로드 버튼 검증용 픽스처(1x1 PNG · 최소 mp3 프레임 헤더).
const fixturePng = join(shotDir, 'fixture.png');
writeFileSync(
  fixturePng,
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  ),
);
const fixtureMp3 = join(shotDir, 'fixture.mp3');
writeFileSync(fixtureMp3, Buffer.from([0xff, 0xfb, 0x90, 0x00, 0x00, 0x00, 0x00, 0x00]));

/** UploadButton은 <button>과 숨김 <input type=file> 을 형제로 렌더링한다 — 버튼 기준으로 input을 찾아 파일을 주입. */
const uploadVia = (button, file) => button.locator('xpath=following-sibling::input[@type="file"]').first().setInputFiles(file);

const BASE = process.env.BASE_URL || 'http://localhost:4173';
const log = (...a) => console.log(...a);
const fails = [];
const assert = (cond, msg) => {
  log(cond ? '✅' : '❌', msg);
  if (!cond) fails.push(msg);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on('console', (m) => {
  if (m.type() === 'error') log('  [browser console.error]', m.text());
});
page.on('pageerror', (e) => log('  [pageerror]', e.message));

try {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  assert(await page.getByText('Novel-Agent').first().isVisible(), '앱 로드(헤더 표시)');

  // 1) 샘플 → 분석
  await page.getByRole('button', { name: /^✨ 샘플$/ }).click();
  await page.getByRole('button', { name: /^🔍 분석$/ }).click();
  await page.waitForTimeout(500);
  const cardCount = await page.locator('input.field.font-semibold').count();
  assert(cardCount === 5, `장면 카드 5개 렌더 (실제 ${cardCount})`);
  await page.screenshot({ path: join(shotDir, '1-scenes.png'), fullPage: true });

  // 2) 전체 승인
  await page.getByRole('button', { name: '전체 승인' }).click();
  await page.waitForTimeout(300);
  const approvedChips = await page.getByRole('button', { name: '✓ 전체 승인됨' }).count();
  assert(approvedChips > 0, '전체 승인 완료 상태 표시');

  // 3) 첫 장면 배경 업로드 (픽스처 PNG) — SceneCard 첫 버튼
  await uploadVia(page.getByRole('button', { name: /배경 업로드/ }).first(), fixturePng);
  await page.waitForSelector('img[src^="blob:"]', { timeout: 15000 });
  assert(true, '배경 이미지(blob) 업로드·표시');

  // 4) 첫 장면 BGM 업로드 (픽스처 mp3)
  await uploadVia(page.getByRole('button', { name: /BGM 업로드/ }).first(), fixtureMp3);
  await page.waitForSelector('audio[src^="blob:"]', { timeout: 20000 });
  assert(true, 'BGM 오디오(blob) 업로드·표시');
  await page.screenshot({ path: join(shotDir, '2-generated.png'), fullPage: true });

  // 4.5) 에셋 탭 — 첫 캐릭터 기본 입화 업로드 (픽스처 PNG)
  await page.getByRole('button', { name: /^🎨 에셋$/ }).click();
  await page.waitForTimeout(300);
  const before = await page.locator('img[src^="blob:"]').count();
  await uploadVia(page.getByRole('button', { name: /기본 입화 업로드/ }).first(), fixturePng);
  await page.waitForFunction(
    (n) => document.querySelectorAll('img[src^="blob:"]').length > n,
    before,
    { timeout: 20000 },
  );
  assert(true, '캐릭터 스프라이트(업로드) 표시');
  await page.screenshot({ path: join(shotDir, '4-sprites.png'), fullPage: true });

  // 5) Ren'Py 탭 — 스크립트 내용 확인
  await page.getByRole('button', { name: /Ren'Py/ }).click();
  await page.waitForTimeout(300);
  const pre = await page.locator('pre').first().innerText();
  log('  --- script.rpy 앞부분 ---\n' + pre.split('\n').slice(0, 14).map((l) => '    ' + l).join('\n'));
  assert(/label scene_1\b/.test(pre), "script.rpy 에 label scene_1 존재");
  assert(/menu:/.test(pre), 'script.rpy 에 menu 블록 존재');
  // 의상(복장) 기능이 들어온 뒤 show 문 속성이 둘(`<의상> <표정>`)이라 `\w+` 하나로는 안 맞는다.
  assert(/show c_\d+ [\w ]+ at /.test(pre), 'script.rpy 에 캐릭터 show 문 존재');
  await page.screenshot({ path: join(shotDir, '3-renpy.png'), fullPage: true });

  // 6) ZIP 생성 → 다운로드 → 내용물 검증
  await page.getByRole('button', { name: /ZIP 생성/ }).click();
  let download;
  try {
    download = await page.waitForEvent('download', { timeout: 90000 });
  } catch (err) {
    const toastTxt = await page.locator('.fixed.bottom-4').textContent().catch(() => '(toast 없음)');
    log('  ⏱ download 미발생. 현재 toast:', toastTxt);
    throw err;
  }
  const zipPath = join(shotDir, 'out.zip');
  await download.saveAs(zipPath);
  const zip = await JSZip.loadAsync(readFileSync(zipPath));
  const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
  log('  ZIP 내용:', names.join(', '));
  assert(names.includes('game/script.rpy'), 'ZIP: game/script.rpy');
  assert(names.includes('game/characters.rpy'), 'ZIP: game/characters.rpy');
  assert(names.includes('game/assets.rpy'), 'ZIP: game/assets.rpy');
  assert(names.includes('game/options.rpy'), 'ZIP: game/options.rpy');
  assert(names.includes('game/screens.rpy'), 'ZIP: game/screens.rpy (최소 자립형 화면)');
  assert(names.includes('game/fonts/NanumGothic.ttf'), 'ZIP: 한글 폰트(나눔고딕) 포함');
  assert(names.some((n) => n.startsWith('game/images/sprite_') && n.endsWith('.png')), 'ZIP: 캐릭터 스프라이트 PNG 포함');
  assert(names.some((n) => n.startsWith('game/images/bg_') && n.endsWith('.png')), 'ZIP: 배경 PNG 포함');
  assert(names.some((n) => n.startsWith('game/audio/bgm_') && n.endsWith('.mp3')), 'ZIP: 업로드한 BGM mp3 포함');

  // PNG 매직넘버 + BGM 은 업로드 픽스처 바이트가 그대로 들어갔는지 확인.
  const bgFile = names.find((n) => n.startsWith('game/images/bg_'));
  const pngBuf = await zip.files[bgFile].async('uint8array');
  assert(pngBuf[0] === 0x89 && pngBuf[1] === 0x50, `배경 PNG 시그니처 정상 (${bgFile}, ${pngBuf.length} bytes)`);
  const mp3File = names.find((n) => n.startsWith('game/audio/bgm_'));
  const mp3Buf = await zip.files[mp3File].async('uint8array');
  const fixtureMp3Buf = readFileSync(fixtureMp3);
  assert(
    mp3Buf.length === fixtureMp3Buf.length && mp3Buf.every((b, i) => b === fixtureMp3Buf[i]),
    `BGM mp3 픽스처 바이트 일치 (${mp3File}, ${mp3Buf.length} bytes)`,
  );

  // 7) 새로고침 후 자동복원
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const restored = await page.locator('input.field.font-semibold').count();
  assert(restored === 5, `새로고침 후 자동복원 (장면 ${restored})`);

  // 7.5) Outfit AI 제안 칩 — 실제 브라우저 클릭 경로(적용/무시/모두 적용/모두 무시)
  //
  // ⚠️ production 에 test-only hook 을 넣지 않는다. 제안을 만드는 유일한 경로가 AI 배치라서
  // OpenAI 응답만 route 로 가로채고, 나머지(키 입력·의상 추가·버튼 클릭)는 전부 실제 UI 를 쓴다.
  {
    // prompt(의상 이름)와 confirm(비용 확인)은 처리 방식이 다르다 — 하나로 뭉치면 의상 이름이
    // confirm 에 들어가거나 그 반대가 된다. 이 섹션이 끝나면 반드시 해제한다(뒤 단계의
    // page.once('dialog') 와 중복 등록되면 "Dialog is already handled" 로 죽는다).
    const onDialog = async (d) => {
      if (d.type() === 'prompt') await d.accept('사복');
      else await d.accept();
    };
    page.on('dialog', onDialog);

    /**
     * 모델 응답은 **나가는 요청에서 역산**한다(이름·인덱스·의상 하드코딩 0). 그렇다고 아무 조합이나
     * 고르면 안 된다 — 요청의 `characters` 와 `lines` 는 **서로 다른 축**이다:
     *
     *  · `characters` = 파서의 `batch.characters` 그대로 = **장면 단위** 자격 목록
     *    (그 장면 화자 ∧ 비주인공 ∧ 추가 의상 ≥1, 합동 대사는 members 로 전개된 개별 이름).
     *    ⇒ 여기 실린 이름은 이미 주인공 제외·joint 합성 라벨 제외를 통과한 값이다.
     *  · `lines`      = writable scan 줄(지문·주인공 대사도 포함된다 — 전환의 **근거**가 될 수 있으므로).
     *    ⇒ "그 줄에서 그 캐릭터가 말한다"는 파서의 요구사항이 **아니다**.
     *
     * 그래서 남는 줄 단위 게이트 세 개만 여기서 직접 피한다:
     *  ① `fixed` 에 그 (i, character) 가 있으면 사람이 이미 지정한 자리 → 거부
     *  ② 그 줄 시점 effective outfit 과 같으면 no-op → 거부
     *     (window 안의 `fixed` 전이를 반영해야 한다 — currentOutfit 은 window **시작** 상태다)
     *  ③ 장면 첫 텍스트 줄 + outfitSource==='scene-manual' 이면 Scene-start 보호 → 거부
     *     (payload 에 firstTextualIndex 가 없으므로 lines[0] 을 보수적으로 회피한다)
     */
    let mockError = null;
    let mockCalls = 0;
    await page.route('**/v1/chat/completions', async (route) => {
      try {
        mockCalls++;
        const body = route.request().postDataJSON();
        const user = JSON.parse(body.messages[1].content);
        if (!user.characters?.length) throw new Error('요청에 후보 캐릭터가 없음');
        if (!user.lines?.length) throw new Error('scan 줄이 없음');
        const fixed = user.fixed ?? [];

        /** 그 줄 시점의 확정 의상 — fixed 중 (같은 캐릭터 ∧ i ≤ 대상) 에서 **가장 큰 i** 의 값. */
        const effectiveOutfit = (c, lineI) => {
          let best = null;
          for (const f of fixed) {
            if (f.character !== c.character || f.i > lineI) continue;
            if (!best || f.i > best.i) best = f;
          }
          return best ? best.outfit : c.currentOutfit;
        };
        /** 그 줄에서 실제로 말하는 캐릭터인가 — 필수 조건이 아니라 **가점**(지문 줄도 정상 대상이다). */
        const speaksOn = (c, line) =>
          line.speaker === c.character || (line.members ?? []).includes(c.character);

        // 뒤에서부터(= 첫 텍스트 줄에서 먼 쪽부터) 훑어 유효 pair 를 찾는다.
        let pick = null;
        for (let li = user.lines.length - 1; li >= 0 && !pick; li--) {
          const line = user.lines[li];
          if (typeof line?.i !== 'number') continue;
          const usable = [];
          for (const c of user.characters) {
            if (li === 0 && c.outfitSource === 'scene-manual') continue; // ③
            if (fixed.some((f) => f.i === line.i && f.character === c.character)) continue; // ①
            const eff = effectiveOutfit(c, line.i);
            const outfit = (c.outfits ?? []).find((o) => o !== eff); // ②
            if (!outfit) continue;
            usable.push({ i: line.i, character: c.character, outfit, speaks: speaksOn(c, line) });
          }
          // 실제 화자인 쪽을 우선하되, 없으면 지문·타 화자 줄도 정상 대상이므로 그대로 쓴다.
          pick = usable.find((u) => u.speaks) ?? usable[0] ?? null;
        }
        if (!pick) throw new Error('파서가 인정할 (line, character, outfit) 조합을 요청에서 찾지 못함');

        // ⚠️ HTTP 본문은 OpenAI envelope 여야 한다 — 앱은 choices[0].message.content 의 **문자열**을
        // 꺼내 그 안의 JSON 을 파싱한다. body 를 곧장 {"changes":[…]} 로 주면 절대 안 걸린다.
        const content = JSON.stringify({
          changes: [
            { i: pick.i, character: pick.character, outfit: pick.outfit, reason: 'e2e 검증' },
          ],
        });
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ choices: [{ message: { content } }] }),
        });
      } catch (e) {
        mockError = e.message;
        await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
      }
    });

    // 키 입력(실제 UI) — 없으면 배치가 즉시 에러 토스트만 내고 끝난다.
    await page.locator('input[placeholder="sk-..."]').fill('sk-e2e-dummy');

    // 추가 의상 부여 — 주인공은 대상에서 빠지므로 카드를 골라내지 않고 전부에 하나씩 준다
    // (주인공에게 생긴 의상은 무해하고, 최소 한 명의 비주인공 화자가 대상 자격을 얻는다).
    await page.getByRole('button', { name: /^🎨 에셋$/ }).click();
    await page.waitForTimeout(300);
    const addOutfitBtns = page.getByRole('button', { name: /＋ 의상/ });
    const addCount = await addOutfitBtns.count();
    for (let i = 0; i < addCount; i++) {
      await addOutfitBtns.nth(i).click();
      await page.waitForTimeout(120);
    }
    assert(addCount > 0, `추가 의상 부여 (캐릭터 ${addCount}명)`);

    /**
     * 추천 실행 → **배치가 끝날 때까지 기다린 뒤** 장면 탭으로 이동한다.
     * ⚠️ 고정 sleep 을 쓰면 안 된다: 요청 사이에 PACE 1.2초가 붙어 총 시간이 장면 수에 비례하고,
     * 아직 실행 중인 상태에서 세면 "제안 0건"이라는 거짓 실패가 난다(실제로 겪음). busy 동안 버튼
     * 라벨이 "N/M 분석 중…" 으로 바뀌므로 그 라벨이 사라지는 것으로 완료를 판정한다.
     */
    const runSuggest = async () => {
      await page.getByRole('button', { name: /^🎨 에셋$/ }).click();
      await page.waitForTimeout(200);
      await page.getByRole('button', { name: /의상 전환 추천/ }).click();
      const busyBtn = page.getByRole('button', { name: /분석 중/ });
      await busyBtn.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
      await busyBtn.waitFor({ state: 'hidden', timeout: 120000 });
      await page.getByRole('button', { name: /^🎬 장면$/ }).click();
      await page.waitForTimeout(400);
    };
    const chipCount = () => page.getByText(/^🤖 .+ → .+$/).count();
    // ⚠️ 👗 텍스트로 세면 장면 카드의 "👗 의상" 편집 영역까지 걸려 실제 적용 건수와 어긋난다
    // (델타로만 봐도 결론은 같지만 계측이 거짓말을 한다). ✕ 버튼의 title 은 줄 의상 칩에만 있다.
    const wornCount = () => page.getByTitle(/이 줄의 의상 지정을 해제/).count();

    await runSuggest();
    if (mockError) log('  [mock]', mockError);
    assert(mockCalls > 0, `AI 요청이 실제로 나감 (${mockCalls}회)`);
    assert(!mockError, `mock 이 유효한 target 을 역산함${mockError ? ` — ${mockError}` : ''}`);
    const firstChips = await chipCount();
    assert(firstChips > 0, `제안 칩 렌더 (${firstChips}건)`);
    // ⚠️ 이 fixture 는 줄 의상을 하나도 안 쓴다(샘플 대본에 #복장 태그가 없다). 그 전제를 숨겨두지
    // 않고 **명시적으로 고정**한다 — 0 이 아니면 아래 "정확히 방금 쓴 override 를 지웠다"는 단언이
    // 흐려진다(임의의 기존 항목을 지워도 개수만 맞아 거짓 통과할 수 있다).
    const baseWorn = await wornCount();
    assert(baseWorn === 0, `fixture 전제: 시작 시 줄 의상 0건 (실제 ${baseWorn})`);
    await page.screenshot({ path: join(shotDir, '5-outfit-suggestions.png'), fullPage: true });

    // ① 무시 — canonical 무변경이라 rerun 만으로 다음 case 가 깨끗해진다.
    await page.getByRole('button', { name: '무시', exact: true }).first().click();
    await page.waitForTimeout(300);
    assert((await chipCount()) === firstChips - 1, '무시: 그 칩만 사라짐');
    assert((await wornCount()) === baseWorn, '무시: Line.outfits 무변경');

    // ② 모두 무시 — 그 장면 칩이 통째로 사라지고 canonical 은 그대로.
    await runSuggest();
    const beforeIgnoreAll = await chipCount();
    await page.getByRole('button', { name: '모두 무시', exact: true }).first().click();
    await page.waitForTimeout(300);
    assert((await chipCount()) < beforeIgnoreAll, '모두 무시: 그 장면 칩이 사라짐');
    assert((await wornCount()) === baseWorn, '모두 무시: Line.outfits 무변경');

    // ③ 적용 — canonical 이 바뀌는 첫 case.
    //    ⚠️ "첫 제안 칩"과 "첫 적용 버튼"을 **각각 전역에서** 고르면 서로 다른 제안일 수 있다.
    //    제안 하나의 행(<p>)을 잡아 그 안에서 텍스트와 버튼을 **같은 container 로** 읽는다.
    await runSuggest();
    const row = page.locator('p').filter({ hasText: /^🤖 .+ → .+/ }).first();
    const rowText = await row.locator('span').first().innerText(); // "🤖 <캐릭터> → <의상>"
    const m = rowText.match(/^🤖\s*(.+?)\s*→\s*(.+?)\s*$/);
    assert(!!m, `제안 칩에서 캐릭터·의상 추출 (${rowText.replace(/\s+/g, ' ')})`);
    const [, pickedChar, pickedOutfit] = m ?? [];
    await row.getByRole('button', { name: '적용', exact: true }).click();
    await page.waitForTimeout(400);
    const wornAfterApply = await wornCount();
    assert(wornAfterApply === 1, `적용: 👗 칩 0 → ${wornAfterApply} (${pickedChar}→${pickedOutfit})`);

    // ⚠️ **rerun 만으로는 reset 이 아니다** — 적용된 의상이 그대로면 같은 제안이 no-op 으로
    // 정당하게 reject 돼 다음 case 의 칩이 0건이 된다. 기존 UI 경로(👗 칩의 ✕)로 원복한다.
    // ✕(setLineOutfit)는 제안 목록도 전체 clear 하므로 반드시 **원복 → rerun** 순서여야 한다.
    // ⚠️ `.first()` 로 아무 칩이나 지우면 안 된다 — **방금 적용한 그 (캐릭터→의상) 칩**을 지목한다.
    const appliedChip = page
      .locator('span')
      .filter({ hasText: `👗 ${pickedChar}→${pickedOutfit}` })
      .first();
    assert((await appliedChip.count()) > 0, `적용된 칩을 지목 (👗 ${pickedChar}→${pickedOutfit})`);
    await appliedChip.getByTitle(/이 줄의 의상 지정을 해제/).click();
    await page.waitForTimeout(300);
    assert((await wornCount()) === 0, '✕: 방금 적용한 그 override 만 제거(canonical 원복)');

    // ④ 모두 적용
    await runSuggest();
    await page.getByRole('button', { name: '모두 적용', exact: true }).first().click();
    await page.waitForTimeout(400);
    const wornAfterApplyAll = await wornCount();
    assert(wornAfterApplyAll > 0, `모두 적용: 👗 칩 0 → ${wornAfterApplyAll}`);
    await page.screenshot({ path: join(shotDir, '6-outfit-applied.png'), fullPage: true });

    // 뒷단계(초기화 confirm 은 page.once('dialog') 를 쓴다)와 충돌하지 않게 반드시 정리한다.
    page.off('dialog', onDialog);
    await page.unroute('**/v1/chat/completions');
  }

  // 8) 프로젝트 내보내기 → 초기화 → 가져오기 round-trip
  const [proj] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    page.getByRole('button', { name: /내보내기/ }).click(),
  ]);
  const projPath = join(shotDir, 'project.npproj.zip');
  await proj.saveAs(projPath);
  // 내보낸 파일 자체 검증
  const pzip = await JSZip.loadAsync(readFileSync(projPath));
  const pnames = Object.keys(pzip.files).filter((n) => !pzip.files[n].dir);
  assert(pnames.includes('project.json'), '프로젝트 파일: project.json 포함');
  assert(pnames.some((n) => n.startsWith('assets/')), '프로젝트 파일: 에셋 바이너리 포함');

  // 초기화(confirm 수락) → 장면 0
  page.once('dialog', (d) => d.accept());
  // 버튼 title 은 "전체 초기화 (대본·설정 포함 모두 삭제)" — getByTitle 은 기본이 완전일치라 정규식으로 찾는다.
  await page.getByTitle(/전체 초기화/).click();
  await page.waitForTimeout(500);
  const afterReset = await page.locator('input.field.font-semibold').count();
  assert(afterReset === 0, `초기화 후 장면 0 (실제 ${afterReset})`);

  // 가져오기: 숨김 input 에 파일 주입
  await page.locator('input[type=file][accept*="npproj"]').setInputFiles(projPath);
  await page.waitForTimeout(1000);
  const afterImport = await page.locator('input.field.font-semibold').count();
  assert(afterImport === 5, `가져오기 후 장면 5 복원 (실제 ${afterImport})`);
  const restoredImg = await page.locator('img[src^="blob:"]').count();
  assert(restoredImg > 0, '가져오기 후 배경 에셋(blob) 복원');
  await page.screenshot({ path: join(shotDir, '4-imported.png'), fullPage: true });
} catch (e) {
  log('❌ 예외:', e.message);
  fails.push('예외: ' + e.message);
  await page.screenshot({ path: join(shotDir, 'error.png'), fullPage: true }).catch(() => {});
} finally {
  await browser.close();
}

log('\n=== 결과:', fails.length === 0 ? '전체 통과 ✅' : `${fails.length}개 실패 ❌`, '===');
if (fails.length) process.exitCode = 1;
