import {
  menuButtonFile,
  TITLE_LOGO_FILE,
  GAME_ICON_FILE,
  WINDOW_ICON_FILE,
  matchMenuButtonFile,
  MAIN_MENU_SLOTS,
  MENU_BUTTON_STATES,
  quickButtonFile,
  QUICK_PANEL_FILE,
  matchQuickButtonFile,
  QUICK_MENU_SLOTS,
  QUICK_BUTTON_STATES,
  matchEscImageFile,
  ESC_IMAGES,
} from '../types';
import type { MenuButtonSlot, MenuButtonState, QuickButtonSlot, QuickButtonState, EscImageId } from '../types';
import { extFromMime } from '../renpy/generate';
import type { State } from './types';
import type { SliceCreator } from './context';
import { describeNames } from './helpers';

export const createMenuGuiSlice: SliceCreator<
  Pick<
    State,
    | 'importMenuArt'
    | 'clearMenuArt'
    | 'importTitleBgm'
    | 'clearTitleBgm'
    | 'importGameIcon'
    | 'clearGameIcon'
    | 'importMenuButton'
    | 'clearMenuButton'
    | 'importMenuButtons'
    | 'importTitleLogo'
    | 'clearTitleLogo'
    | 'setMainMenuLayout'
    | 'setMainMenuPreset'
    | 'setMenuLabel'
    | 'setMenuFont'
    | 'importQuickButton'
    | 'clearQuickButton'
    | 'importQuickButtons'
    | 'importQuickPanel'
    | 'clearQuickPanel'
    | 'setQuickMenuLayout'
    | 'importEscImage'
    | 'clearEscImage'
    | 'importEscImages'
    | 'setEscColors'
    | 'setEscFont'
  >
> = (_set, get, ctx) => {
  const { flash, commitAssetSwap, uploadAsset } = ctx;
  return {
    importMenuArt: async (file) => {
      try {
        const id = await uploadAsset(file, 'background', 'main_menu.png');
        const prev = get().project.menuArt?.main;
        await commitAssetSwap(
          (s) => ({ project: { ...s.project, menuArt: { ...s.project.menuArt, main: id } } }),
          prev ? [prev] : [],
          id,
        );
        flash('타이틀 배경을 업로드했습니다.');
      } catch (e) {
        flash((e as Error).message);
      }
    },

    clearMenuArt: async () => {
      const prev = get().project.menuArt?.main;
      await commitAssetSwap((s) => {
        const menuArt = { ...s.project.menuArt };
        delete menuArt.main;
        return { project: { ...s.project, menuArt } };
      }, prev ? [prev] : []);
      flash('타이틀 배경 업로드를 해제했습니다(테마 그라데이션으로 복귀).');
    },

    importTitleBgm: async (file) => {
      try {
        // ext 는 실제 MIME 기준(extFromMime) — 장면 BGM 처럼 파일명 확장자를 그대로 믿지 않는다
        // (types.ts Project.titleBgm JSDoc 의 wav→mp3 오라벨링 전례 참고).
        const ext = extFromMime(file.type);
        const id = await uploadAsset(file, 'bgm', `title_bgm.${ext}`);
        const prev = get().project.titleBgm?.assetId;
        await commitAssetSwap(
          (s) => ({ project: { ...s.project, titleBgm: { assetId: id, ext } } }),
          prev ? [prev] : [],
          id,
        );
        flash('타이틀 BGM을 업로드했습니다.');
      } catch (e) {
        flash((e as Error).message);
      }
    },

    clearTitleBgm: async () => {
      const prev = get().project.titleBgm?.assetId;
      await commitAssetSwap(
        (s) => ({ project: { ...s.project, titleBgm: undefined } }),
        prev ? [prev] : [],
      );
      flash('타이틀 BGM 업로드를 해제했습니다.');
    },

    importGameIcon: async (which, file) => {
      const isIco = which === 'ico';
      // .ico 는 OS 에 MIME 이 등록 안 돼 있으면 File.type 이 빈 문자열로 온다(Windows 에서 흔함).
      // 그때만 확장자로 판정해 mime 을 직접 넘긴다 — uploadAsset 의 image/* 검사에 막히지 않도록.
      const icoByExt = isIco && !file.type && /\.ico$/i.test(file.name);
      if (isIco && !icoByExt && !/^image\/(x-icon|vnd\.microsoft\.icon)$/.test(file.type)) {
        // png 를 .ico 슬롯에 올리면 Ren'Py 빌드가 조용히 아이콘을 안 바꾼다(파서가 ICO 헤더를 기대).
        // 여기서 막지 않으면 "배포했는데 아이콘이 기본값"이라는 나중에 알아채기 어려운 실패가 된다.
        flash('exe 아이콘은 .ico 파일이어야 합니다(PNG 는 아래 창 아이콘 칸에 올리세요).', 'error');
        return;
      }
      try {
        const id = await uploadAsset(
          file,
          'background',
          isIco ? GAME_ICON_FILE : (WINDOW_ICON_FILE.split('/').pop() as string),
          icoByExt ? { mime: 'image/x-icon' } : undefined,
        );
        const prev = get().project.gameIcon?.[which];
        await commitAssetSwap(
          (s) => ({ project: { ...s.project, gameIcon: { ...s.project.gameIcon, [which]: id } } }),
          prev ? [prev] : [],
          id,
        );
        flash(isIco ? 'exe 아이콘(.ico)을 적용했습니다.' : '게임 창 아이콘을 적용했습니다.');
      } catch (e) {
        flash((e as Error).message);
      }
    },

    clearGameIcon: async (which) => {
      const prev = get().project.gameIcon?.[which];
      await commitAssetSwap((s) => {
        const gameIcon = { ...s.project.gameIcon };
        delete gameIcon[which];
        return { project: { ...s.project, gameIcon } };
      }, prev ? [prev] : []);
      flash(which === 'ico' ? 'exe 아이콘을 해제했습니다.' : '게임 창 아이콘을 해제했습니다.');
    },

    importMenuButton: async (slot, state, file) => {
      // press(클릭 중) 상태는 Ren'Py imagebutton 이 지원하지 않는다(activate_ 프리픽스를 실제로
      // 세팅하는 코드가 엔진에 없는 죽은 슬롯) — 업로드 자체를 받지 않고 안내만 한다.
      if (!MENU_BUTTON_STATES.find((x) => x.id === state)?.renpySupported) {
        flash("클릭(눌림) 이미지는 Ren'Py 가 지원하지 않아 적용할 수 없습니다.");
        return;
      }
      try {
        // menuButtonFile 은 game/ 안 경로(gui/menu/<slot>_<state>.png) — uploadAsset 의 filename 인자는
        // 저장소 파일명일 뿐이라 그 basename 만 쓰되, 폴더 없는 flat 이름이라 눈에 띄게 menu_ 를 덧붙인다.
        const id = await uploadAsset(file, 'background', `menu_${menuButtonFile(slot, state).split('/').pop()}`);
        const prev = get().project.mainMenuUi?.buttons?.[slot]?.[state];
        await commitAssetSwap(
          (s) => ({
            project: {
              ...s.project,
              mainMenuUi: {
                ...s.project.mainMenuUi,
                buttons: {
                  ...s.project.mainMenuUi?.buttons,
                  [slot]: { ...s.project.mainMenuUi?.buttons?.[slot], [state]: id },
                },
              },
            },
          }),
          prev ? [prev] : [],
          id,
        );
        const slotLabel = MAIN_MENU_SLOTS.find((x) => x.id === slot)?.label ?? slot;
        const stateLabel = MENU_BUTTON_STATES.find((x) => x.id === state)?.label ?? state;
        flash(`${slotLabel} 버튼(${stateLabel}) 이미지를 적용했습니다.`);
      } catch (e) {
        flash((e as Error).message);
      }
    },

    clearMenuButton: async (slot, state) => {
      const prev = get().project.mainMenuUi?.buttons?.[slot]?.[state];
      await commitAssetSwap((s) => {
        const slotStates = { ...s.project.mainMenuUi?.buttons?.[slot] };
        delete slotStates[state];
        return {
          project: {
            ...s.project,
            mainMenuUi: {
              ...s.project.mainMenuUi,
              buttons: { ...s.project.mainMenuUi?.buttons, [slot]: slotStates },
            },
          },
        };
      }, prev ? [prev] : []);
      const slotLabel = MAIN_MENU_SLOTS.find((x) => x.id === slot)?.label ?? slot;
      const stateLabel = MENU_BUTTON_STATES.find((x) => x.id === state)?.label ?? state;
      flash(`${slotLabel} 버튼(${stateLabel}) 이미지를 해제했습니다.`);
    },

    // 파일명 자동 매칭 일괄 업로드(matchMenuButtonFile) — 매칭된 것만 업로드하고 한 번의
    // commitAssetSwap 으로 반영한다(20장을 올려도 리렌더·autoSave 는 한 번). 매칭 실패 파일은
    // 조용히 버리지 않고 파일명을 토스트에 함께 보여준다(사용자가 파일명을 고쳐 다시 시도하도록).
    // press(클릭) 로 매칭된 파일은 "인식 실패"가 아니라 "건너뜀"으로 따로 안내한다 — 파일명은
    // 제대로 인식했지만 Ren'Py 가 그 상태를 지원하지 않아 저장하지 않는 것이라 원인이 다르다.
    importMenuButtons: async (files) => {
      const matched: { slot: MenuButtonSlot; state: MenuButtonState; file: File }[] = [];
      const unmatched: string[] = [];
      const skippedPress: string[] = [];
      for (const file of files) {
        const m = matchMenuButtonFile(file.name);
        if (!m) {
          unmatched.push(file.name);
          continue;
        }
        if (MENU_BUTTON_STATES.find((x) => x.id === m.state)?.renpySupported === false) {
          skippedPress.push(file.name);
          continue;
        }
        matched.push({ slot: m.slot, state: m.state, file });
      }
      if (matched.length === 0) {
        const parts: string[] = [];
        if (skippedPress.length) parts.push(`클릭 이미지는 지원하지 않아 제외: ${describeNames(skippedPress)}`);
        if (unmatched.length) parts.push(`인식 실패: ${describeNames(unmatched)}`);
        flash(parts.length ? parts.join(' / ') : '적용할 파일이 없습니다.');
        return;
      }
      try {
        const prevIds: string[] = [];
        const updates: { slot: MenuButtonSlot; state: MenuButtonState; id: string }[] = [];
        for (const { slot, state, file } of matched) {
          const id = await uploadAsset(file, 'background', `menu_${menuButtonFile(slot, state).split('/').pop()}`);
          const prev = get().project.mainMenuUi?.buttons?.[slot]?.[state];
          if (prev) prevIds.push(prev);
          updates.push({ slot, state, id });
        }
        await commitAssetSwap((s) => {
          const buttons = { ...s.project.mainMenuUi?.buttons };
          for (const u of updates) buttons[u.slot] = { ...buttons[u.slot], [u.state]: u.id };
          return { project: { ...s.project, mainMenuUi: { ...s.project.mainMenuUi, buttons } } };
        }, prevIds);
        let msg = `메뉴 버튼 ${updates.length}개를 적용했습니다.`;
        if (skippedPress.length) {
          msg += ` (클릭 이미지 ${skippedPress.length}개는 Ren'Py가 '누르는 중' 상태를 지원하지 않아 제외)`;
        }
        if (unmatched.length) msg += ` (인식 실패: ${describeNames(unmatched)})`;
        flash(msg);
      } catch (e) {
        flash((e as Error).message);
      }
    },

    importTitleLogo: async (file) => {
      try {
        const id = await uploadAsset(file, 'background', TITLE_LOGO_FILE.split('/').pop()!);
        // 원본 가로/세로 비율을 재서 저장 — screensRpy 가 로고 박스를 정사각(xysize=(w,w))으로 굽으면
        // fit="contain" 이 3:1 가로형 로고를 세로 중앙정렬해 logoY 가 왼쪽 위 기준에서 어긋난다
        // (buildZip.ts 의 trimSpriteMargins 와 같은 createImageBitmap 패턴). 실패해도 업로드
        // 자체는 성공시키고(폴백 비율은 screensRpy 가 처리) 조용히 aspect 만 비운다.
        let logoAspect: number | undefined;
        try {
          const bitmap = await createImageBitmap(file);
          if (bitmap.width > 0 && bitmap.height > 0) logoAspect = bitmap.width / bitmap.height;
          bitmap.close?.();
        } catch {
          // 비율 측정 실패 — logoAspect 미지정(screensRpy 폴백 사용).
        }
        const prev = get().project.mainMenuUi?.logo;
        await commitAssetSwap(
          (s) => ({
            project: { ...s.project, mainMenuUi: { ...s.project.mainMenuUi, logo: id, logoAspect } },
          }),
          prev ? [prev] : [],
          id,
        );
        flash('타이틀 로고를 업로드했습니다.');
      } catch (e) {
        flash((e as Error).message);
      }
    },

    clearTitleLogo: async () => {
      const prev = get().project.mainMenuUi?.logo;
      await commitAssetSwap((s) => {
        const mainMenuUi = { ...s.project.mainMenuUi };
        delete mainMenuUi.logo;
        delete mainMenuUi.logoAspect; // 로고가 없는데 이전 비율만 남으면 다음 업로드 전까지 의미 없는 값.
        return { project: { ...s.project, mainMenuUi } };
      }, prev ? [prev] : []);
      flash('타이틀 로고 업로드를 해제했습니다(기존 제목 텍스트로 복귀).');
    },

    setMainMenuLayout: (patch) => {
      const { project } = get();
      get().updateProjectMeta({
        mainMenuUi: { ...project.mainMenuUi, layout: { ...project.mainMenuUi?.layout, ...patch } },
      });
    },

    setMainMenuPreset: (preset) => {
      const { project } = get();
      // layout·labels 오버라이드를 비운다 — 안 비우면 예전 프리셋에서 손댄 좌표/라벨이 새 프리셋
      // 위에도 그대로 남아 "프리셋을 골랐는데 기본값이 아니다"가 된다. 유실 경고는 UI 담당(확인창) 몫.
      get().updateProjectMeta({
        mainMenuUi: { ...project.mainMenuUi, preset, layout: undefined, labels: undefined },
      });
    },

    setMenuLabel: (slot, part, value) => {
      const { project } = get();
      const cur = { ...(project.mainMenuUi?.labels ?? {}) };
      const entry = { ...(cur[slot] ?? {}) };
      if (value) entry[part] = value;
      else delete entry[part]; // 빈 문자열 = 오버라이드 해제(프리셋 기본값으로 복귀)
      if (entry.main || entry.sub) cur[slot] = entry;
      else delete cur[slot]; // 주·부 둘 다 비었으면 슬롯 자체를 지운다(빈 객체 잔존 방지)
      get().updateProjectMeta({ mainMenuUi: { ...project.mainMenuUi, labels: cur } });
    },

    setMenuFont: (which, fontId) => {
      const { project } = get();
      const key = which === 'main' ? 'menuFontId' : 'menuSubFontId';
      const mainMenuUi = { ...project.mainMenuUi };
      if (fontId) mainMenuUi[key] = fontId;
      else delete mainMenuUi[key];
      get().updateProjectMeta({ mainMenuUi });
    },

    importQuickButton: async (slot, state, file) => {
      // press(클릭 중) 상태는 Ren'Py imagebutton 이 지원하지 않는다 — importMenuButton 과 같은 이유
      // (activate_ 프리픽스를 실제로 세팅하는 코드가 엔진에 없는 죽은 슬롯).
      if (!QUICK_BUTTON_STATES.find((x) => x.id === state)?.renpySupported) {
        flash("클릭(눌림) 이미지는 Ren'Py 가 지원하지 않아 적용할 수 없습니다.");
        return;
      }
      try {
        const id = await uploadAsset(file, 'background', `quick_${quickButtonFile(slot, state).split('/').pop()}`);
        const prev = get().project.quickMenuUi?.buttons?.[slot]?.[state];
        await commitAssetSwap(
          (s) => ({
            project: {
              ...s.project,
              quickMenuUi: {
                ...s.project.quickMenuUi,
                buttons: {
                  ...s.project.quickMenuUi?.buttons,
                  [slot]: { ...s.project.quickMenuUi?.buttons?.[slot], [state]: id },
                },
              },
            },
          }),
          prev ? [prev] : [],
          id,
        );
        const slotLabel = QUICK_MENU_SLOTS.find((x) => x.id === slot)?.label ?? slot;
        const stateLabel = QUICK_BUTTON_STATES.find((x) => x.id === state)?.label ?? state;
        flash(`${slotLabel} 버튼(${stateLabel}) 이미지를 적용했습니다.`);
      } catch (e) {
        flash((e as Error).message);
      }
    },

    clearQuickButton: async (slot, state) => {
      const prev = get().project.quickMenuUi?.buttons?.[slot]?.[state];
      await commitAssetSwap((s) => {
        const slotStates = { ...s.project.quickMenuUi?.buttons?.[slot] };
        delete slotStates[state];
        return {
          project: {
            ...s.project,
            quickMenuUi: {
              ...s.project.quickMenuUi,
              buttons: { ...s.project.quickMenuUi?.buttons, [slot]: slotStates },
            },
          },
        };
      }, prev ? [prev] : []);
      const slotLabel = QUICK_MENU_SLOTS.find((x) => x.id === slot)?.label ?? slot;
      const stateLabel = QUICK_BUTTON_STATES.find((x) => x.id === state)?.label ?? state;
      flash(`${slotLabel} 버튼(${stateLabel}) 이미지를 해제했습니다.`);
    },

    // 파일명 자동 매칭 일괄 업로드(matchQuickButtonFile) — importMenuButtons 와 동일 패턴: 매칭된
    // 것만 업로드하고 한 번의 commitAssetSwap 으로 반영. 매칭 실패 파일은 조용히 버리지 않고
    // 파일명을 토스트에 함께 보여준다. press(클릭) 매칭분은 "인식 실패"와 원인이 다르므로
    // "건너뜀"으로 따로 안내한다.
    importQuickButtons: async (files) => {
      const matched: { slot: QuickButtonSlot; state: QuickButtonState; file: File }[] = [];
      const unmatched: string[] = [];
      const skippedPress: string[] = [];
      for (const file of files) {
        const m = matchQuickButtonFile(file.name);
        if (!m) {
          unmatched.push(file.name);
          continue;
        }
        if (QUICK_BUTTON_STATES.find((x) => x.id === m.state)?.renpySupported === false) {
          skippedPress.push(file.name);
          continue;
        }
        matched.push({ slot: m.slot, state: m.state, file });
      }
      if (matched.length === 0) {
        const parts: string[] = [];
        if (skippedPress.length) parts.push(`클릭 이미지는 지원하지 않아 제외: ${describeNames(skippedPress)}`);
        if (unmatched.length) parts.push(`인식 실패: ${describeNames(unmatched)}`);
        flash(parts.length ? parts.join(' / ') : '적용할 파일이 없습니다.');
        return;
      }
      try {
        const prevIds: string[] = [];
        const updates: { slot: QuickButtonSlot; state: QuickButtonState; id: string }[] = [];
        for (const { slot, state, file } of matched) {
          const id = await uploadAsset(file, 'background', `quick_${quickButtonFile(slot, state).split('/').pop()}`);
          const prev = get().project.quickMenuUi?.buttons?.[slot]?.[state];
          if (prev) prevIds.push(prev);
          updates.push({ slot, state, id });
        }
        await commitAssetSwap((s) => {
          const buttons = { ...s.project.quickMenuUi?.buttons };
          for (const u of updates) buttons[u.slot] = { ...buttons[u.slot], [u.state]: u.id };
          return { project: { ...s.project, quickMenuUi: { ...s.project.quickMenuUi, buttons } } };
        }, prevIds);
        let msg = `퀵메뉴 버튼 ${updates.length}개를 적용했습니다.`;
        if (skippedPress.length) {
          msg += ` (클릭 이미지 ${skippedPress.length}개는 Ren'Py가 '누르는 중' 상태를 지원하지 않아 제외)`;
        }
        if (unmatched.length) msg += ` (인식 실패: ${describeNames(unmatched)})`;
        flash(msg);
      } catch (e) {
        flash((e as Error).message);
      }
    },

    importQuickPanel: async (file) => {
      try {
        const id = await uploadAsset(file, 'background', `quick_${QUICK_PANEL_FILE.split('/').pop()}`);
        // 패널 원본 가로/세로(px) — importTitleLogo 의 logoAspect 측정과 같은 이유(screensRpy 가
        // 실제 비율로 배치). 실패해도 업로드는 성공시키고 조용히 치수만 비운다(screensRpy 폴백 232×625).
        let panelWidth: number | undefined;
        let panelHeight: number | undefined;
        try {
          const bitmap = await createImageBitmap(file);
          if (bitmap.width > 0 && bitmap.height > 0) {
            panelWidth = bitmap.width;
            panelHeight = bitmap.height;
          }
          bitmap.close?.();
        } catch {
          // 치수 측정 실패 — panelWidth/panelHeight 미지정(screensRpy 폴백 사용).
        }
        const prev = get().project.quickMenuUi?.panel;
        await commitAssetSwap(
          (s) => ({
            project: {
              ...s.project,
              quickMenuUi: { ...s.project.quickMenuUi, panel: id, panelWidth, panelHeight },
            },
          }),
          prev ? [prev] : [],
          id,
        );
        flash('퀵메뉴 패널 이미지를 업로드했습니다.');
      } catch (e) {
        flash((e as Error).message);
      }
    },

    clearQuickPanel: async () => {
      const prev = get().project.quickMenuUi?.panel;
      await commitAssetSwap((s) => {
        const quickMenuUi = { ...s.project.quickMenuUi };
        delete quickMenuUi.panel;
        delete quickMenuUi.panelWidth; // 패널이 없는데 이전 치수만 남으면 다음 업로드 전까지 의미 없는 값.
        delete quickMenuUi.panelHeight;
        return { project: { ...s.project, quickMenuUi } };
      }, prev ? [prev] : []);
      flash('퀵메뉴 패널 업로드를 해제했습니다(패널 없이 버튼만 표시).');
    },

    setQuickMenuLayout: (patch) => {
      const { project } = get();
      get().updateProjectMeta({
        quickMenuUi: { ...project.quickMenuUi, layout: { ...project.quickMenuUi?.layout, ...patch } },
      });
    },

    importEscImage: async (id, file) => {
      try {
        const assetId = await uploadAsset(file, 'background', `esc_${id}.png`);
        const prev = get().project.escMenuUi?.images?.[id];
        await commitAssetSwap(
          (s) => ({
            project: {
              ...s.project,
              escMenuUi: {
                ...s.project.escMenuUi,
                images: { ...s.project.escMenuUi?.images, [id]: assetId },
              },
            },
          }),
          prev ? [prev] : [],
          assetId,
        );
        const label = ESC_IMAGES.find((x) => x.id === id)?.label ?? id;
        flash(`${label} 이미지를 적용했습니다.`);
      } catch (e) {
        flash((e as Error).message);
      }
    },

    clearEscImage: async (id) => {
      const prev = get().project.escMenuUi?.images?.[id];
      await commitAssetSwap((s) => {
        const images = { ...s.project.escMenuUi?.images };
        delete images[id];
        return { project: { ...s.project, escMenuUi: { ...s.project.escMenuUi, images } } };
      }, prev ? [prev] : []);
      const label = ESC_IMAGES.find((x) => x.id === id)?.label ?? id;
      flash(`${label} 이미지를 해제했습니다.`);
    },

    // ESC 메뉴 글자색. 이미지가 아니라 Ren'Py 가 그리는 텍스트라 팔레트로만 맞출 수 있다(세이브
    // 날짜·대사 기록·페이지 번호처럼 동적인 글자가 대부분). 빈 문자열을 주면 그 롤은 기본값으로.
    setEscColors: (patch) => {
      const { project } = get();
      const colors = { ...project.escMenuUi?.colors, ...patch };
      for (const k of Object.keys(colors) as (keyof typeof colors)[]) {
        if (!colors[k]) delete colors[k];
      }
      get().updateProjectMeta({ escMenuUi: { ...project.escMenuUi, colors } });
    },

    // ESC 메뉴 글꼴 — setMenuFont(mainMenuUi) 와 같은 패턴. 빈 값이면 필드 자체를 지운다(인터페이스
    // 폰트로 복귀 — types.ts escMenuUi.fontId 주석 참고: 이미지가 하나도 없으면 애초에 무시된다).
    setEscFont: (fontId) => {
      const { project } = get();
      const escMenuUi = { ...project.escMenuUi };
      if (fontId) escMenuUi.fontId = fontId;
      else delete escMenuUi.fontId;
      get().updateProjectMeta({ escMenuUi });
    },

    // 파일명 자동 매칭 일괄 업로드(matchEscImageFile) — importQuickButtons 와 동일 패턴이지만
    // 슬롯×상태 격자가 아니라 역할 하나뿐이라 "press 건너뜀" 같은 세 번째 분류가 없다(매칭/불일치 둘뿐).
    // 23장을 업로드해도 commitAssetSwap 은 배치 전체에 한 번만 호출한다(재렌더·autoSave 1회).
    importEscImages: async (files) => {
      const matched: { id: EscImageId; file: File }[] = [];
      const unmatched: string[] = [];
      for (const file of files) {
        const id = matchEscImageFile(file.name);
        if (!id) {
          unmatched.push(file.name);
          continue;
        }
        matched.push({ id, file });
      }
      if (matched.length === 0) {
        flash(unmatched.length ? `인식 실패: ${describeNames(unmatched)}` : '적용할 파일이 없습니다.');
        return;
      }
      try {
        const prevIds: string[] = [];
        const updates: { id: EscImageId; assetId: string }[] = [];
        for (const { id, file } of matched) {
          const assetId = await uploadAsset(file, 'background', `esc_${id}.png`);
          const prev = get().project.escMenuUi?.images?.[id];
          if (prev) prevIds.push(prev);
          updates.push({ id, assetId });
        }
        await commitAssetSwap((s) => {
          const images = { ...s.project.escMenuUi?.images };
          for (const u of updates) images[u.id] = u.assetId;
          return { project: { ...s.project, escMenuUi: { ...s.project.escMenuUi, images } } };
        }, prevIds);
        let msg = `ESC 메뉴 이미지 ${updates.length}개를 적용했습니다.`;
        if (unmatched.length) msg += ` (인식 실패: ${describeNames(unmatched)})`;
        flash(msg);
      } catch (e) {
        flash((e as Error).message);
      }
    },
  };
};
