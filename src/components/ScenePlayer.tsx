// 브라우저 안에서 한 장면을 재생하는 미니 플레이어.
// 배경 + 캐릭터(위치·표정) + 대사창을 그려, Ren'Py 로 내보내기 전에 표정·배치를 확인한다.
// 스프라이트 에셋이 없으면 canvasSprite 임시 이미지로 그려 표정 변화를 즉시 보여준다.

import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import { resolveEmotion } from '../generators/emotion';
import { canvasSprite } from '../generators/image/canvasSprite';
import { canvasImage } from '../generators/image/canvasProvider';
import { getAsset } from '../storage/assetStore';
import { arrangePositions } from '../renpy/generate';
import {
  resolveTheme,
  withGuiOverrides,
  hexWithAlpha,
  dialogueGradientColor,
  DEFAULT_GRADIENT_OPACITY,
  DEFAULT_GRADIENT_HEIGHT,
} from '../renpy/gui';
import { gradientAlphaAt } from '../generators/image/canvasMenu';
import {
  emojiFor,
  spriteAssetId,
  outfitFlags,
  spriteHiddenFlags,
  type Scene,
  type Character,
  type Expression,
  type Line,

} from '../types';

const speakersOf = (l: Line): string[] =>
  l.kind === 'dialogue' ? (l.members?.length ? l.members : [l.speaker]) : [];

/**
 * 무대에 설 캐릭터(주인공 제외)의 가로 위치 — generate.ts 의 scriptBody 와 완전히 같은 함수
 * (arrangePositions, export 해서 재사용)로 계산한다. scriptBody 는 장면 안에서 새 캐릭터가
 * 처음 등장할 때마다 "그때까지 등장한 순서"로 다시 배치하므로(side:'left'/'right' 고정 캐릭터는
 * 양끝, 'auto'는 등장 순서로 가운데를 채움 — 혼자면 항상 중앙), 여기서도 uptoLine 까지 등장한
 * 화자만으로 order 를 매번 다시 구성해야 같은 결과가 나온다(예전엔 spreadPositions 를 장면 전체
 * 등장 순서로 1회만 호출해 side 를 완전히 무시했다 — 생성기·미리보기 두 구현이 어긋나는 CLAUDE.md
 * 함정과 같은 종류의 버그). CG 배경이 뜬 뒤(activeCgIdx>=0)는 스프라이트 자체를 그리지 않으므로
 * (ScenePlayer 의 렌더 조건) 그 상태에서는 위치가 안 쓰이지만, activeCgIdx<0 이면 아직 CG가
 * 시작되지 않았다는 뜻이라 scriptBody 의 cgActive 게이팅 없이 단순 누적으로도 정확히 같다.
 * 컴포넌트 밖의 순수 함수라 React 없이도 테스트할 수 있다(tests/scene-player-positions.test.ts).
 *
 * 인물 숨김(spriteHiddenFlags, generate.ts 와 공유하는 단일 판정 소스)도 CG 와 같은 방식으로 게이팅
 * 한다 — 현재 줄이 숨김이면 빈 Map, 순서 누적 루프도 숨김 줄은 건너뛴다(그 구간에서 처음 말한
 * 캐릭터는 order 에 안 들어가 다시 표시돼도 유령처럼 안 튀어나온다 — generate.ts 의 revealedOrder와
 * 대칭). 숨기기 전에 이미 순서에 들어간 캐릭터는 숨김 구간을 건너뛰어도 order 에 그대로 남아있어
 * 다시 표시되면 같은 자리로 복원된다(generate.ts 의 lastShown 복원과 대칭).
 */
export function computeStagePositions(
  scene: Scene,
  characters: Character[],
  uptoLine: number,
  activeCgIdx: number,
): Map<string, number> {
  if (activeCgIdx >= 0) return new Map();
  const hiddenFlags = spriteHiddenFlags(scene);
  if (hiddenFlags[uptoLine]) return new Map();
  const isNarrOnly = (name: string) => !!characters.find((c) => c.name === name)?.isProtagonist;
  const order: string[] = [];
  for (let k = 0; k <= uptoLine && k < scene.lines.length; k++) {
    if (hiddenFlags[k]) continue;
    const l = scene.lines[k];
    if (l.kind !== 'dialogue') continue;
    for (const sp of speakersOf(l)) if (!isNarrOnly(sp) && !order.includes(sp)) order.push(sp);
  }
  const sideByName = new Map(characters.map((c) => [c.name, c.side ?? 'auto']));
  return arrangePositions(order, sideByName);
}

/**
 * 한 캐릭터의 (의상·표정) 스프라이트 — 에셋이 있으면 그것, 없으면 Canvas 임시 이미지.
 * 실제 생성 게임(vn_char, generate.ts)과 같은 구도로 그린다: 머리 위 2% 여백을 두고
 * k(=1.15×characterScale) 배로 키워 발은 화면 아래로 크롭(스테이지의 overflow-hidden 이 잘라냄).
 */
function PreviewSprite({
  char,
  expr,
  outfit,
  xpct,
  k,
}: {
  char: Character;
  expr: Expression;
  outfit?: string;
  xpct: number;
  k: number;
}) {
  const assetId = spriteAssetId(char, outfit, expr);
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let alive = true;
    let obj: string | undefined;
    (async () => {
      let blob: Blob | undefined;
      if (assetId) blob = await getAsset(assetId);
      if (!blob) blob = await canvasSprite(char.name, expr, char.color);
      if (!alive) return;
      obj = URL.createObjectURL(blob);
      setUrl(obj);
    })();
    return () => {
      alive = false;
      if (obj) URL.revokeObjectURL(obj);
    };
  }, [char.name, char.color, expr, assetId]);
  if (!url) return null;
  return (
    <img
      src={url}
      className="absolute max-w-[48%] object-contain pointer-events-none"
      style={{ left: `${xpct}%`, top: '2%', height: `${k * 100}%`, transform: 'translateX(-50%)' }}
    />
  );
}

export default function ScenePlayer({ scene, bgUrl }: { scene: Scene; bgUrl?: string }) {
  const characters = useStore((s) => s.project.characters);
  // 배경 키워드 의상 규칙 — project 전체가 아니라 이 배열만 좁게 구독(불필요 리렌더 방지).
  const outfitRules = useStore((s) => s.project.outfitRules);
  // 캐릭터 크기 슬라이더 — generate.ts 의 vn_char 와 동일 공식(기본 1.15배, 사용자 배율 곱).
  const characterScale = useStore((s) => s.project.guiOverrides?.characterScale);
  const charK = 1.15 * (characterScale ?? 1);
  // 대사창 그라데이션 설정 — 실제 출력(guiRpy/buildZip)과 같은 값을 읽어야 미리보기가 거짓말을 안 한다.
  const genre = useStore((s) => s.project.genre);
  const customTheme = useStore((s) => s.project.guiTheme);
  const guiOverrides = useStore((s) => s.project.guiOverrides);
  // resolveTheme 은 ensureReadableMenu 까지 적용된(메뉴 가독성 보정 끝난) 최종 테마를 준다 —
  // buildZip 이 그라데이션 기본색을 뽑을 때 쓰는 것과 동일한 테마여야 미리보기가 실제와 맞는다.
  const theme = useMemo(() => resolveTheme(genre, customTheme), [genre, customTheme]);
  const gradientOn = guiOverrides?.dialogueGradient ?? false;
  const gradientOpacity = guiOverrides?.dialogueGradientOpacity ?? DEFAULT_GRADIENT_OPACITY;
  const gradientHeightRatio = guiOverrides?.dialogueGradientHeight ?? DEFAULT_GRADIENT_HEIGHT;
  // 그라데이션 ON: 작업 3(textboxGradientPng)의 gradientAlphaAt 을 여러 지점에서 호출해 CSS 스톱을
  // 만든다 — 하드코딩한 스톱을 쓰면 실제 PNG 출력(곡선)과 미리보기가 어긋날 수 있어서다.
  // 색 미지정이면 검정이 아니라 테마의 dialogueBox 색(buildZip 과 동일 규칙) — 밝은 테마(로맨스/일상)에서
  // 검정 그라데이션 위에 어두운 본문 글자가 안 보이던 문제(실기 확인)를 미리보기에서도 재현하지 않는다.
  // OFF: 단색 박스 경로(withGuiOverrides)가 실제로 만드는 최종 dialogueBox(색+알파)를 그대로 쓴다 —
  // 사용자가 색·불투명도를 하나도 안 건드렸으면 테마 고유값, 건드렸으면 그 값 기준으로 계산된다.
  const textboxBg = useMemo(() => {
    if (gradientOn) {
      const boxColor = dialogueGradientColor(theme, guiOverrides?.dialogueBoxColor);
      const stops = Array.from({ length: 11 }, (_, idx) => {
        const t = idx / 10;
        const alpha = gradientAlphaAt(t, gradientOpacity);
        return `${hexWithAlpha(boxColor, alpha)} ${Math.round(t * 100)}%`;
      });
      return `linear-gradient(to bottom, ${stops.join(', ')})`;
    }
    return withGuiOverrides(theme, guiOverrides).dialogueBox;
  }, [gradientOn, theme, guiOverrides, gradientOpacity]);
  const textboxHeightPct = gradientOn ? gradientHeightRatio * 100 : 25;
  const [step, setStep] = useState(0);
  useEffect(() => setStep(0), [scene.id]);

  const charByName = useMemo(() => new Map(characters.map((c) => [c.name, c])), [characters]);
  const isNarrOnly = (name: string) => !!charByName.get(name)?.isProtagonist;
  // 표정 판정은 resolveEmotion(generators/emotion/resolve.ts) 단일 소스에 위임 — generate.ts 의
  // effectiveEmotion 과 완전히 같은 우선순위(작가 태그 > AI 배정 > 휴리스틱 > 기본)라야 미리보기가
  // 실제 생성 게임과 어긋나지 않는다. resolveEmotion 은 Project 전체를 요구하지만 실제로 읽는 필드는
  // expressions(선언된 표정 목록 검증용) 뿐이라, `s.project` 통째 구독(키 입력마다 전체 리렌더 —
  // CLAUDE.md 함정) 대신 그 필드 하나만 좁게 구독해 최소 shape 로 넘긴다.
  const expressions = useStore((s) => s.project.expressions);
  const emoOf = (l: Line): Expression => resolveEmotion(l, scene, { expressions });

  const total = scene.lines.length;
  const i = Math.min(step, Math.max(0, total - 1));
  const cur = scene.lines[i] as Line | undefined;
  const projW = useStore((s) => s.project.width);
  const projH = useStore((s) => s.project.height);

  // CG 배경 전환(generate.ts 와 동일 규칙): 현재 줄까지 나온 마지막 kind:'cg' 라인의 CG 가 배경이
  // 되고 스프라이트는 숨긴다. 위치 마커가 없는 기존 데이터는 첫 CG 를 장면 시작부터 배경으로 폴백.
  const activeCgIdx = useMemo(() => {
    if (!scene.cg.length) return -1;
    if (!scene.lines.some((l) => l.kind === 'cg')) return 0;
    let idx = -1;
    for (let k = 0; k <= i && k < total; k++) {
      const l = scene.lines[k];
      if (l.kind !== 'cg') continue;
      const j = scene.cg.findIndex((d) => d.trim() === l.desc);
      if (j >= 0) idx = j;
    }
    return idx;
  }, [scene, i, total]);

  // 순수 함수(computeStagePositions, 위에서 export)로 위임 — 생성기(scriptBody)와 같은
  // arrangePositions 를 같은 방식(현재 줄까지 점진적으로 커지는 order)으로 호출한다.
  const positions = useMemo(
    () => computeStagePositions(scene, characters, i, activeCgIdx),
    [scene, characters, i, activeCgIdx],
  );
  const cgAssetId = activeCgIdx >= 0 ? scene.cgAssetIds?.[activeCgIdx] : undefined;
  const cgDesc = activeCgIdx >= 0 ? scene.cg[activeCgIdx] : undefined;
  const [cgUrl, setCgUrl] = useState<string>();
  useEffect(() => {
    let alive = true;
    let obj: string | undefined;
    if (cgDesc === undefined) {
      setCgUrl(undefined);
      return;
    }
    (async () => {
      let blob: Blob | undefined;
      if (cgAssetId) blob = await getAsset(cgAssetId);
      if (!blob) blob = await canvasImage(cgDesc, `CG: ${cgDesc}`, projW, projH);
      if (!alive) return;
      obj = URL.createObjectURL(blob);
      setCgUrl(obj);
    })();
    return () => {
      alive = false;
      if (obj) URL.revokeObjectURL(obj);
    };
  }, [cgAssetId, cgDesc, projW, projH]);

  // 인물 숨김 — generate.ts 와 공유하는 단일 판정 소스(spriteHiddenFlags). 지금 줄이 숨김이면
  // 스프라이트를 아예 그리지 않는다(아래 렌더 게이트). 이 항목이 없으면(필드 미사용) 전부 false라
  // 기존 동작과 동일.
  const hiddenFlags = useMemo(() => spriteHiddenFlags(scene), [scene]);

  // 줄마다의 의상 — generate.ts(scriptBody)와 공유하는 단일 판정 소스(outfitFlags). 장면 단위
  // resolveOutfit 을 직접 부르면 장면 도중의 #복장(줄 전환)을 미리보기가 놓쳐 실제 게임과 어긋난다.
  // (장면,캐릭터)당 한 번만 계산해 재사용한다 — 생성기의 outfitAt 캐시와 같은 이유.
  const outfitsByChar = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const c of characters) {
      if (!c.isProtagonist) m.set(c.name, outfitFlags(scene, outfitRules, c.name));
    }
    return m;
  }, [scene, characters, outfitRules]);

  // 현재 줄까지 각 캐릭터의 "최신 표정"(Ren'Py 처럼 마지막 표정 유지). 숨김 구간(hiddenFlags[k])에
  // 등장한 화자는 생성기(revealedOrder)와 동일하게 목록에 넣지 않는다 — 그래야 다시 표시로 돌아왔을
  // 때 숨김 중 처음 말한 캐릭터가 유령처럼 튀어나오지 않는다. 숨기기 전에 이미 서 있던 캐릭터는 이
  // 루프가 그 이전 줄에서 채워둔 값을 그대로 들고 있으므로(숨김 구간은 그냥 건너뜀) 다시 표시될 때
  // 자동으로 복원된다(생성기의 lastShown 복원과 대칭).
  const visible = new Map<string, Expression>();
  for (let k = 0; k <= i && k < total; k++) {
    if (hiddenFlags[k]) continue;
    const l = scene.lines[k];
    if (l.kind !== 'dialogue') continue;
    const emo = emoOf(l);
    for (const sp of speakersOf(l)) if (!isNarrOnly(sp)) visible.set(sp, emo);
  }

  const isJoint = cur?.kind === 'dialogue' && !!cur.members?.length;
  const name =
    cur?.kind === 'dialogue' ? (isJoint ? cur.members!.join(' & ') : cur.speaker) : null;
  const nameColor = name && !isJoint ? charByName.get(name)?.color : undefined;
  // 주인공(내레이션 전용)은 얼굴이 없으니 대사창에 표정 라벨을 표시하지 않는다.
  const curNarrOnly = cur?.kind === 'dialogue' && !isJoint && isNarrOnly(cur.speaker);
  const curEmo = cur ? emoOf(cur) : '기본';
  const showEmo = !!cur && !curNarrOnly && curEmo !== '기본';
  // 아이템 라인은 대사가 없으니 팝업 표시(또는 닫기)를 안내 문구로 보여준다.
  const curText = !cur
    ? ''
    : cur.kind === 'item'
      ? cur.name
        ? `🎁 아이템 팝업: ${cur.name}`
        : '🎁 아이템 닫기'
      : cur.kind === 'cg'
        ? `🖼 CG 배경 전환: ${cur.desc || '(설명 없음)'}`
        : cur.kind === 'bgm'
          ? `🎵 BGM: ${cur.name}` // 미리보기는 오디오를 재생하지 않으므로 표시만(실제 재생은 generate.ts)
          : cur.text;

  return (
    <div>
      {/* 컨테이너 크기 기준 단위(cqh)를 쓰려고 size 컨테이너로 선언 — 대사창 글자 크기를 미리보기
          크기와 무관하게 "실제 게임의 화면 높이 대비 비율"과 똑같이 맞추기 위함. */}
      <div
        className="relative aspect-video rounded-xl border border-edge bg-ink overflow-hidden"
        style={{ containerType: 'size' }}
      >
        {cgUrl ? (
          // CG 배경: 뒤판 = cover+blur 확대(여백 채움), 앞판 = contain 원본(Ren'Py 출력과 동일 연출)
          <>
            <img src={cgUrl} className="absolute inset-0 w-full h-full object-cover blur-lg scale-110" />
            <img src={cgUrl} className="absolute inset-0 w-full h-full object-contain" />
          </>
        ) : bgUrl ? (
          <img src={bgUrl} className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-600">
            배경 미생성
          </div>
        )}
        {activeCgIdx < 0 && !hiddenFlags[i] && [...visible].map(([nm, ex]) => {
          const c = charByName.get(nm);
          return c ? (
            <PreviewSprite key={nm} char={c} expr={ex} outfit={outfitsByChar.get(nm)?.[i]} xpct={positions.get(nm) ?? 50} k={charK} />
          ) : null;
        })}
        {cur && (
          // 높이·배경 = 실제 생성 게임과 동일한 설정값에서 계산(하드코딩 금지 — 설정 바꾸면 미리보기도 바뀜).
          // 그라데이션 OFF 일 땐 기존처럼 25%(단색 박스 textbox_height, 화면 높이의 1/4과 동일 비율).
          // backdrop-blur 는 실제 게임 렌더링엔 없는 CSS 전용 효과라 뺐다(미리보기가 실물보다 예뻐 보이는 거짓말 방지).
          <div className="absolute inset-x-0 bottom-0 px-3 py-1.5 overflow-hidden" style={{ height: `${textboxHeightPct}%`, background: textboxBg }}>
            {name && (
              // 글자 크기는 화면 높이 대비 비율(cqh)로 — 실제 게임의 45/1080(이름)·33/1080(본문)과 동일 비율.
              // 다만 미리보기가 작을 땐 그대로 두면 읽을 수 없어 최소 px 바닥을 둔다(비율 유지 + 가독성).
              <div
                className="font-bold mb-0.5"
                style={{ color: nameColor ?? '#ffffff', fontSize: 'max(13px, 4.17cqh)' }}
              >
                {name}
                {showEmo && (
                  <span className="ml-1.5 font-normal opacity-90" style={{ fontSize: 'max(10px, 2.6cqh)' }}>
                    {emojiFor(curEmo)} {curEmo}
                  </span>
                )}
              </div>
            )}
            <div className="text-white leading-snug" style={{ fontSize: 'max(11px, 3.06cqh)' }}>
              {curText}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 mt-2">
        <button className="btn-ghost" disabled={i <= 0} onClick={() => setStep(i - 1)} title="이전 대사">
          ◀
        </button>
        <span className="text-xs text-gray-500 flex-1 text-center">
          {total ? i + 1 : 0} / {total}
        </span>
        <button className="btn-ghost" disabled={i >= total - 1} onClick={() => setStep(i + 1)} title="다음 대사">
          ▶
        </button>
        <button className="btn-ghost text-[11px]" onClick={() => setStep(0)} title="처음부터">
          ↺
        </button>
      </div>
      <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">
        ▶ 로 대사를 넘기며 캐릭터·표정·위치를 미리 확인하세요. 스프라이트가 없으면 임시 이미지로
        표정을 표시합니다.
      </p>
    </div>
  );
}
