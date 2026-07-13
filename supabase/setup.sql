-- ───────────────────────────────────────────────────────────────────────────
--  Novel-Agent 협업(2인) Supabase 설정 — SQL Editor 에 전체 붙여넣고 실행.
--  재실행해도 안전(idempotent). 셀프호스트/프로젝트 재구축 시 이 파일 하나면 된다.
--
--  ⚠️ 접근 모델(의도된 설계): 방 코드를 아는 사람은 누구나 읽기·쓰기(2인 신뢰 전제,
--  CLAUDE.md·README 참고). 그래서 아래 RLS 정책은 전부 개방(true)이다 — RLS 를 켜는
--  이유는 접근 제한이 아니라 Security Advisor 의 "RLS Disabled in Public" 해소와
--  "앱이 안 쓰는 DELETE 는 기본 거부" 확보다. 정책 없이 RLS 만 켜면 협업이 400 으로
--  즉시 깨지므로 반드시 정책까지 같이 실행할 것.
-- ───────────────────────────────────────────────────────────────────────────

-- ── 1. 프로젝트 relay 테이블 (src/collab/sync.ts 가 사용) ──
create table if not exists public.projects (
  room       text primary key,          -- 방 코드(roomKey(): trim+소문자) = Realtime 채널 접미사
  data       jsonb not null,            -- 프로젝트 JSON 전체(last-write-wins)
  version    bigint not null default 0, -- 에코 방지용 단조 증가 버전
  updated_by text,                      -- 표시 이름(프레즌스용, 없으면 null)
  updated_at timestamptz not null default now()
);

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
