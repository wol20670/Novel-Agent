-- ───────────────────────────────────────────────────────────────────────────
--  Novel-Agent 협업(2인) Supabase 설정 — SQL Editor 에 전체 붙여넣고 실행.
--  재실행해도 안전(idempotent). 셀프호스트/프로젝트 재구축 시 이 파일 하나면 된다.
--
--  ⚠️ 접근 모델(의도된 설계): 아래 RLS 정책은 전부 개방(true)이다 — RLS 를 켜는 이유는
--  접근 제한이 아니라 Security Advisor 의 "RLS Disabled in Public" 해소와 "앱이 안 쓰는
--  DELETE 는 기본 거부" 확보다. 정책 없이 RLS 만 켜면 협업이 400 으로 즉시 깨지므로
--  반드시 정책까지 같이 실행할 것.
--
--  ⚠️ 실제 노출 범위 — "방 코드를 아는 사람만"보다 **넓다**(2026-08-05 확인·감수):
--    · anon 키는 설계상 JS 번들에 구워져 공개된다(진짜 경계는 RLS 인데 그 RLS 가 전부 개방).
--    · Storage 오브젝트 키가 `<assetId>` 평면 구조라 **방 단위 구분이 아예 없다.**
--    → 배포 사이트를 열 수 있는 사람은 누구나 assets 버킷 전체를 목록 조회·다운로드·업로드·
--      덮어쓰기 할 수 있다. projects 테이블은 방 코드(PK)를 알아야 하지만 그것도 추측 가능.
--    실질 방어선은 "배포 URL 을 모른다" 하나뿐 — 2 인 사설 도구라 감수한 선택이다.
--    뒤집으려면 ① 버킷을 public 으로 + SELECT 정책 제거(열거 차단, .download() → getPublicUrl
--    코드 변경 필요) 또는 ② Edge 함수가 방 코드를 검증해 signed URL 발급.
--    `service_role` 키는 RLS 를 통째로 우회하니 절대 repo·번들·클라이언트에 넣지 말 것.
--
--  ⚠️ 대시보드가 "Clients can list all files in this bucket → Remove policy" 를 권해도
--  **누르지 말 것** — 버킷이 비공개라 assetsSync 의 .download() 가 SELECT 정책을 필요로 한다.
--  지우는 순간 에셋 동기화가 400 RLS 에러로 깨진다(경고문의 전제는 "공개 버킷"이라 여기 해당 없음).
-- ───────────────────────────────────────────────────────────────────────────

-- ── 1. 프로젝트 relay 테이블 (src/collab/sync.ts 가 사용) ──
create table if not exists public.projects (
  room       text primary key,          -- 방 코드(roomKey(): trim+소문자) = Realtime 채널 접미사
  data       jsonb not null,            -- 프로젝트 JSON 전체(last-write-wins)
  version    bigint not null default 0, -- 순서 참고용 카운터(더 이상 에코 판정에 안 씀)
  updated_by text,                      -- 표시 이름(프레즌스용, 없으면 null)
  updated_at timestamptz not null default now()
);

-- 에코 판정을 version 동률 비교 대신 세션별 client_id 로 한다(동시 편집 시 버전 동률로 상대
-- 변경을 자기 에코로 오판·조용히 유실하는 버그 수정). 기존 테이블에도 안전하게 추가.
alter table public.projects add column if not exists client_id text;

-- Realtime postgres_changes 구독(subscribeProject)이 이벤트를 받으려면 publication 에 있어야 함.
do $$
begin
  alter publication supabase_realtime add table public.projects;
exception
  when duplicate_object then null; -- 이미 추가돼 있으면 무시
end $$;

-- ── 2. projects RLS: 켜고, 현행과 동일한 개방 정책 명시 ──
alter table public.projects enable row level security;

drop policy if exists "collab open select" on public.projects;
create policy "collab open select" on public.projects
  for select to anon, authenticated using (true);

drop policy if exists "collab open insert" on public.projects;
create policy "collab open insert" on public.projects
  for insert to anon, authenticated with check (true);

drop policy if exists "collab open update" on public.projects;
create policy "collab open update" on public.projects
  for update to anon, authenticated using (true) with check (true);

-- DELETE 정책은 의도적으로 없음: 앱이 행 삭제를 안 하므로 기본 거부(소폭 강화).

-- ── 3. Storage `assets` 버킷 (src/collab/assetsSync.ts 가 사용) ──
-- storage.objects 는 RLS 를 끌 수 없어 anon 정책이 없으면 업로드/다운로드가 400 RLS 에러.
insert into storage.buckets (id, name)
values ('assets', 'assets')
on conflict (id) do nothing;

drop policy if exists "assets open select" on storage.objects;
create policy "assets open select" on storage.objects
  for select to anon, authenticated using (bucket_id = 'assets');

drop policy if exists "assets open insert" on storage.objects;
create policy "assets open insert" on storage.objects
  for insert to anon, authenticated with check (bucket_id = 'assets');

-- upload(upsert: true) 는 기존 오브젝트 덮어쓰기에 update 권한도 필요.
drop policy if exists "assets open update" on storage.objects;
create policy "assets open update" on storage.objects
  for update to anon, authenticated
  using (bucket_id = 'assets') with check (bucket_id = 'assets');
