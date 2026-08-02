// GUI/UI 문자열 다국어 사전 — 게임 인터페이스(메뉴·설정·확인창·도움말)를 자막/음성과 함께
// 선택 언어로 일관되게 표시하기 위한 정적 번역표.
//
// 동작 원리 (Ren'Py 런타임 문자열 번역):
//  - **base(한국어) = 소스 문자열**. screens.rpy 는 한국어 리터럴을 그대로 쓰고, 엔진 확인창
//    (layout.QUIT 등)도 generate 가 한국어로 재정의한다 → config.language=None(기본)에서 한국어.
//  - en/ja = `translate <lang> strings:` (old=한국어, new=대상) → 언어 전환 시 화면 텍스트 자동 치환.
//  - 우리 화면 리터럴과 엔진 확인창을 모두 "한국어 기준" 한 축으로 통일해 번역이 단순·일관.
//
// UI_STRINGS 의 ko 는 **screensRpy.ts 의 _("…") 리터럴과 정확히 일치**해야 한다(런타임 매칭 키).
// 키 이름·포맷 코드({#…}, <, >, Ctrl 등)는 언어 무관이라 여기 넣지 않는다(그대로 표시=정답).

import type { Locale } from '../../types';

export interface UiTr {
  ko: string;
  en: string;
  ja: string;
}

/** 로케일별 텍스트. base(ko)면 원문. */
export function uiTr(t: UiTr, loc: Locale): string {
  return loc === 'ja' ? t.ja : loc === 'en' ? t.en : t.ko;
}

/**
 * 엔진 확인창(yes/no) 문구. Ren'Py 액션이 `layout.<NAME>` 을 소비하고(00action_menu/file),
 * `gui.<NAME>` 도 함께 재정의해 안전하게 base 언어로 만든다. 그 뒤 en/ja 는 translate strings 로.
 */
export const CONFIRM_STRINGS: { name: string; tr: UiTr }[] = [
  { name: 'ARE_YOU_SURE', tr: { ko: '확실합니까?', en: 'Are you sure?', ja: 'よろしいですか？' } },
  { name: 'DELETE_SAVE', tr: { ko: '이 세이브를 삭제하시겠습니까?', en: 'Are you sure you want to delete this save?', ja: 'このセーブを削除しますか？' } },
  { name: 'OVERWRITE_SAVE', tr: { ko: '세이브를 덮어쓰시겠습니까?', en: 'Are you sure you want to overwrite your save?', ja: 'セーブを上書きしますか？' } },
  { name: 'LOADING', tr: { ko: '불러오면 저장하지 않은 진행이 사라집니다.\n계속하시겠습니까?', en: 'Loading will lose unsaved progress.\nAre you sure you want to do this?', ja: 'ロードすると未保存の進行が失われます。\n続けますか？' } },
  { name: 'QUIT', tr: { ko: '정말 종료하시겠습니까?', en: 'Are you sure you want to quit?', ja: '本当に終了しますか？' } },
  { name: 'MAIN_MENU', tr: { ko: '메인 메뉴로 돌아가시겠습니까?\n저장하지 않은 진행이 사라집니다.', en: 'Are you sure you want to return to the main menu?\nThis will lose unsaved progress.', ja: 'メインメニューに戻りますか？\n未保存の進行が失われます。' } },
  { name: 'CONTINUE', tr: { ko: '이어서 진행하시겠습니까?', en: 'Are you sure you want to continue where you left off?', ja: '続きからプレイしますか？' } },
  { name: 'END_REPLAY', tr: { ko: '리플레이를 종료하시겠습니까?', en: 'Are you sure you want to end the replay?', ja: 'リプレイを終了しますか？' } },
  { name: 'SLOW_SKIP', tr: { ko: '스킵을 시작하시겠습니까?', en: 'Are you sure you want to begin skipping?', ja: 'スキップを開始しますか？' } },
  { name: 'FAST_SKIP_SEEN', tr: { ko: '다음 선택지까지 스킵하시겠습니까?', en: 'Are you sure you want to skip to the next choice?', ja: '次の選択肢までスキップしますか？' } },
  { name: 'FAST_SKIP_UNSEEN', tr: { ko: '읽지 않은 대사를 건너뛰고 다음 선택지까지 스킵하시겠습니까?', en: 'Are you sure you want to skip unseen dialogue to the next choice?', ja: '未読の台詞を飛ばして次の選択肢までスキップしますか？' } },
];

/** 우리 GUI(screens.rpy) 리터럴. ko 는 반드시 screensRpy 의 _("…") 와 문자 단위로 일치. */
export const UI_STRINGS: UiTr[] = [
  // 메인/게임 메뉴·내비게이션
  { ko: '시작', en: 'Start', ja: 'スタート' },
  { ko: '불러오기', en: 'Load', ja: 'ロード' },
  { ko: '설정', en: 'Preferences', ja: '設定' },
  { ko: '종료', en: 'Quit', ja: '終了' },
  { ko: '메인 메뉴', en: 'Main Menu', ja: 'メインメニュー' },
  { ko: '메뉴', en: 'Menu', ja: 'メニュー' },
  { ko: '크레딧', en: 'Credits', ja: 'クレジット' },
  { ko: '정보', en: 'About', ja: 'アバウト' },
  { ko: '도움말', en: 'Help', ja: 'ヘルプ' },
  { ko: '돌아가기', en: 'Return', ja: '戻る' },
  { ko: '닫기', en: 'Close', ja: '閉じる' },
  { ko: '버전 [config.version!t]\n', en: 'Version [config.version!t]\n', ja: 'バージョン [config.version!t]\n' },
  // 갤러리(발견한 아이템 · 감상한 CG)
  { ko: '발견한 아이템', en: 'Items Found', ja: '発見したアイテム' },
  { ko: '감상한 CG', en: 'CG Gallery', ja: 'CGギャラリー' },
  // 확인창(yes/no) 버튼
  { ko: '예', en: 'Yes', ja: 'はい' },
  { ko: '아니오', en: 'No', ja: 'いいえ' },
  // 세이브/로드
  { ko: '저장', en: 'Save', ja: 'セーブ' },
  { ko: '자동 저장', en: 'Auto Save', ja: 'オートセーブ' },
  { ko: '빈 슬롯', en: 'Empty Slot', ja: '空きスロット' },
  { ko: '페이지 {}', en: 'Page {}', ja: 'ページ {}' },
  // 퀵 메뉴
  { ko: '뒤로', en: 'Back', ja: '戻る' },
  { ko: '기록', en: 'History', ja: '履歴' },
  { ko: '스킵', en: 'Skip', ja: 'スキップ' },
  { ko: '스킵 중', en: 'Skipping', ja: 'スキップ中' },
  { ko: '자동', en: 'Auto', ja: 'オート' },
  { ko: '숨기기', en: 'Hide UI', ja: 'UIを隠す' },
  { ko: '빠른 저장', en: 'Quick Save', ja: 'クイックセーブ' },
  { ko: '빠른저장', en: 'Quick Save', ja: 'クイックセーブ' },
  { ko: '빠른불러오기', en: 'Quick Load', ja: 'クイックロード' },
  { ko: '리플레이 종료', en: 'End Replay', ja: 'リプレイ終了' },
  // 설정(preferences)
  { ko: '디스플레이', en: 'Display', ja: 'ディスプレイ' },
  { ko: '창 모드', en: 'Window', ja: 'ウィンドウ' },
  { ko: '전체 화면', en: 'Fullscreen', ja: 'フルスクリーン' },
  { ko: '읽지 않은 대사', en: 'Unseen Text', ja: '未読テキスト' },
  { ko: '선택 후에도', en: 'After Choices', ja: '選択肢の後も' },
  { ko: '전환 효과', en: 'Transitions', ja: 'トランジション' },
  { ko: '텍스트 속도', en: 'Text Speed', ja: 'テキスト速度' },
  { ko: '자동 진행 시간', en: 'Auto-Forward Time', ja: 'オートフォワード時間' },
  { ko: '음악 볼륨', en: 'Music Volume', ja: '音楽音量' },
  { ko: '효과음 볼륨', en: 'Sound Volume', ja: '効果音音量' },
  { ko: '음성 볼륨', en: 'Voice Volume', ja: 'ボイス音量' },
  { ko: '전체 음소거', en: 'Mute All', ja: 'すべてミュート' },
  { ko: '테스트', en: 'Test', ja: 'テスト' },
  { ko: '자막 언어', en: 'Text Language', ja: '字幕言語' },
  { ko: '음성 언어', en: 'Voice Language', ja: 'ボイス言語' },
  // 기록/도움말 안내
  { ko: '대화 기록이 비어 있습니다.', en: 'The dialogue history is empty.', ja: '会話履歴は空です。' },
  // 도움말 - 입력 장치
  { ko: '키보드', en: 'Keyboard', ja: 'キーボード' },
  { ko: '마우스', en: 'Mouse', ja: 'マウス' },
  { ko: '게임패드', en: 'Gamepad', ja: 'ゲームパッド' },
  { ko: '방향키', en: 'Arrow Keys', ja: '方向キー' },
  { ko: '보정', en: 'Calibrate', ja: 'キャリブレーション' },
  { ko: '왼쪽 클릭', en: 'Left Click', ja: '左クリック' },
  { ko: '오른쪽 클릭', en: 'Right Click', ja: '右クリック' },
  { ko: '가운데 클릭', en: 'Middle Click', ja: '中央クリック' },
  { ko: '휠 위로', en: 'Wheel Up', ja: 'ホイール上' },
  { ko: '휠 아래로', en: 'Wheel Down', ja: 'ホイール下' },
  { ko: 'D-패드, 스틱', en: 'D-Pad, Stick', ja: 'Dパッド、スティック' },
  { ko: '왼쪽 트리거\n왼쪽 숄더', en: 'Left Trigger\nLeft Shoulder', ja: '左トリガー\n左ショルダー' },
  { ko: '오른쪽 트리거\nA/아래 버튼', en: 'Right Trigger\nA/Bottom Button', ja: '右トリガー\nA/下ボタン' },
  { ko: '오른쪽 숄더', en: 'Right Shoulder', ja: '右ショルダー' },
  { ko: 'Start, Guide, B/오른쪽 버튼', en: 'Start, Guide, B/Right Button', ja: 'スタート、ガイド、B/右ボタン' },
  { ko: 'Y/위 버튼', en: 'Y/Top Button', ja: 'Y/上ボタン' },
  // 도움말 - 동작 설명(툴팁)
  { ko: '대사를 진행하고 인터페이스를 활성화합니다.', en: 'Advances dialogue and activates the interface.', ja: '台詞を進め、インターフェースを有効化します。' },
  { ko: '인터페이스를 탐색합니다.', en: 'Navigates the interface.', ja: 'インターフェースを移動します。' },
  { ko: '이전 대사로 롤백합니다.', en: 'Rolls back to the previous line.', ja: '前の台詞へロールバックします。' },
  { ko: '이후 대사로 롤포워드합니다.', en: 'Rolls forward to the next line.', ja: '次の台詞へロールフォワードします。' },
  { ko: '누르고 있는 동안 대사를 스킵합니다.', en: 'Skips dialogue while held down.', ja: '押している間、台詞をスキップします。' },
  { ko: '대사 스킵을 토글합니다.', en: 'Toggles dialogue skipping.', ja: '台詞のスキップを切り替えます。' },
  { ko: '선택지를 고르지 않고 대사를 진행합니다.', en: 'Advances dialogue without selecting a choice.', ja: '選択肢を選ばずに台詞を進めます。' },
  { ko: '게임 메뉴를 엽니다.', en: 'Opens the game menu.', ja: 'ゲームメニューを開きます。' },
  { ko: '사용자 인터페이스를 숨깁니다.', en: 'Hides the user interface.', ja: 'ユーザーインターフェースを隠します。' },
  { ko: '스크린샷을 찍습니다.', en: 'Takes a screenshot.', ja: 'スクリーンショットを撮ります。' },
  { ko: '접근성 메뉴를 엽니다.', en: 'Opens the accessibility menu.', ja: 'アクセシビリティメニューを開きます。' },
  { ko: '보조 {a=https://www.renpy.org/l/voicing}셀프 보이싱{/a}을 토글합니다.', en: 'Toggles assistive {a=https://www.renpy.org/l/voicing}self-voicing{/a}.', ja: '補助{a=https://www.renpy.org/l/voicing}セルフボイシング{/a}を切り替えます。' },
  // 정보(about) 크레딧 블록
  { ko: '{b}엔진{/b}\nMade with {a=https://www.renpy.org/}Ren\'Py{/a} [renpy.version_only].\n[renpy.license!t]\n', en: '{b}Engine{/b}\nMade with {a=https://www.renpy.org/}Ren\'Py{/a} [renpy.version_only].\n[renpy.license!t]\n', ja: '{b}エンジン{/b}\nMade with {a=https://www.renpy.org/}Ren\'Py{/a} [renpy.version_only].\n[renpy.license!t]\n' },
  { ko: '{b}폰트{/b}\n나눔고딕(NanumGothic), Source Han Sans — 모두 SIL Open Font License 1.1 (상업적 사용 허용).', en: '{b}Font{/b}\nNanumGothic, Source Han Sans — both SIL Open Font License 1.1 (commercial use allowed).', ja: '{b}フォント{/b}\nNanumGothic（ナヌムゴシック）, Source Han Sans（源ノ角ゴシック） — いずれも SIL Open Font License 1.1（商用利用可）。' },
];
