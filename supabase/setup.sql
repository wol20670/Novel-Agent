-- ───────────────────────────────────────────────────────────────────────────
--  Novel-Agent 협업(2인) Supabase 설정 — SQL Editor 에 전체 붙여넣고 실행.
--  재실행해도 안전(idempotent). 셀프호스트/프로젝트 재구축 시 이 파일 하나면 된다.
--  **전체가 하나의 트랜잭션**이다(begin … commit). 중간 오류나 맨 끝 검사(assertion)가 실패하면 전부
--  rollback 돼 실행 전 상태 그대로 남는다. ⚠️ SQL Editor 가 트랜잭션 제어를 거부하면 트랜잭션 없이
--  나눠 실행하지 말고 멈출 것(부분 적용 위험).
--  재실행할 때마다 맨 끝 assertion 이 **현재 상태**(정책 목록·role·버킷 public)를 다시 검증한다 —
--  누가 대시보드에서 정책을 바꿔 놓았다면 재실행이 그 drift 를 지우거나(이름이 아래 drop 목록에 있으면)
--  실패로 알려준다.
--
--  ── 접근 모델(S1-D1 · server-side data plane) ──
--  · projects 테이블과 Storage `assets` 버킷은 **초대된 로그인 계정(authenticated · 비익명)만** 읽고 쓴다.
--    로그인 안 한 요청(DB role `anon`)과 Supabase 익명 로그인 사용자(JWT is_anonymous=true)는 거부된다.
--  · ⚠️ interim trusted-account model: 초대된 계정끼리는 **방 구분이 없다** — 방 코드와 무관하게 전 방 project 를
--    읽고·쓰고, 버킷 전체 에셋을 읽고·쓰고·지울 수 있다(2인 사설 도구 · 신뢰하는 사람만 초대할 것).
--    room 단위 권한과 Presence(public Realtime 채널) 보호는 S1-D2 의 몫이다 — 이 파일만으로
--    end-to-end authorization 이 끝난 것이 아니다.
--  · projects 에 **room 조건을 넣지 말 것** — 원격 정리 스윕(collab/assetsGc.ts)은 전 행 참조 합집합이
--    전제다. RLS 는 걸러진 행을 에러 없이 빼므로 room 단위 SELECT 는 남의 방 에셋을 고아로 오판하게 만든다.
--  · `assets` 버킷은 **비공개(public=false)** 로 강제한다. public 버킷은 /storage/v1/object/public/assets/<id>
--    경로를 RLS 없이 서빙하므로 대시보드에서 Public 을 켜지 말 것(앱은 public URL 을 쓰지 않는다).
--  · ⚠️ 정책·Public 토글을 **대시보드에서 손으로 추가·수정하지 말 것** — 이 파일이 정본이다. permissive 정책은
--    OR 로 합쳐져서 대시보드에서 만든 정책 하나가 이 파일의 제한을 조용히 무력화한다(실제로 setup.sql 밖
--    `assets anon read/insert/update` 가 live 에 남아 있었다 — 아래에서 명시적으로 지운다).
--  · 키 용어를 섞지 말 것: 클라이언트 키 = **publishable key**(번들에 공개되는 값 · secret 아님) /
--    SQL role **`anon`** = 세션 없이 publishable key 만으로 들어온 요청의 DB role.
--    `service_role` 키는 RLS 를 통째로 우회하니 절대 repo·번들·클라이언트에 넣지 말 것.
--
--  ⚠️ 대시보드가 "Clients can list all files in this bucket → Remove policy" 를 권해도 **누르지 말 것** —
--  assetsSync 의 .download() 는 인증 엔드포인트를 타므로 authenticated SELECT 정책이 필요하고, 지우는 순간
--  에셋 동기화가 400 RLS 에러로 깨진다. 원격 정리 스윕도 목록 조회에 SELECT 가 필요하다.
--  ⚠️ 맨 끝 assertion 은 storage.objects 의 anon/public 정책을 **버킷 구분 없이** 금지하고, storage.objects 전체 정책 수를
--  **정확히 4개**(assets member select/insert/update/delete)로 강제한다 — 현재 이 프로젝트엔 assets 외 버킷용 정책이
--  없다는 전제다. 버킷을 늘리면 assertion 범위를 다시 볼 것.
-- ───────────────────────────────────────────────────────────────────────────

begin;

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
-- (구독 이벤트도 아래 SELECT 정책을 따른다 — 로그인 안 한 구독자는 이벤트를 받지 못한다.)
do $$
begin
  alter publication supabase_realtime add table public.projects;
exception
  when duplicate_object then null; -- 이미 추가돼 있으면 무시
end $$;

-- ── 2. projects RLS: 초대된 로그인 계정(비익명)만 ──
alter table public.projects enable row level security;

-- S1-D1 이전의 개방 정책(to anon, authenticated · true) 제거.
drop policy if exists "collab open select" on public.projects;
drop policy if exists "collab open insert" on public.projects;
drop policy if exists "collab open update" on public.projects;
-- 재실행 idempotency.
drop policy if exists "collab member select" on public.projects;
drop policy if exists "collab member insert" on public.projects;
drop policy if exists "collab member update" on public.projects;

create policy "collab member select" on public.projects
  for select to authenticated
  using ((select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false);

-- 빈 방 초기화는 앱이 INSERT 로만 한다(collab/sync.ts insertInitialProject) — 이미 있는 방이면 PK 충돌로 실패해야 한다.
create policy "collab member insert" on public.projects
  for insert to authenticated
  with check ((select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false);

create policy "collab member update" on public.projects
  for update to authenticated
  using      ((select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false)
  with check ((select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false);

-- DELETE 정책은 의도적으로 없음: 앱이 행 삭제를 안 하므로 기본 거부. 원격 정리 스윕의 "에셋은 있는데
-- 프로젝트 행 0 = 불완전 스캔" 판정(store/assetSlice.ts)도 이 전제에 기댄다.

-- ── 3. Storage `assets` 버킷 (src/collab/assetsSync.ts 가 사용) ──
-- storage.objects 는 RLS 를 끌 수 없어 정책이 없으면 업로드/다운로드가 400 RLS 에러.
insert into storage.buckets (id, name)
values ('assets', 'assets')
on conflict (id) do nothing;

-- 비공개 강제 — 위 insert 는 이미 있는 버킷의 public 플래그를 바꾸지 못한다(대시보드에서 켜져 있었다).
-- ⚠️ 이 UPDATE 가 플랫폼 권한으로 거부되면 트랜잭션 전체가 rollback 된다 → 대시보드에서 assets 버킷의
--    Public 을 끈 뒤 이 파일을 다시 실행할 것(SQL 을 억지로 우회하지 말 것).
update storage.buckets set public = false where id = 'assets';

-- setup.sql 밖에서(대시보드) 만들어진 legacy anon 정책 — permissive OR 라 남겨 두면 anon 접근이 그대로 열린다.
drop policy if exists "assets anon read"   on storage.objects;
drop policy if exists "assets anon insert" on storage.objects;
drop policy if exists "assets anon update" on storage.objects;
-- S1-D1 이전의 개방 정책(to anon, authenticated · bucket_id = 'assets') 제거.
drop policy if exists "assets open select" on storage.objects;
drop policy if exists "assets open insert" on storage.objects;
drop policy if exists "assets open update" on storage.objects;
drop policy if exists "assets open delete" on storage.objects;
-- 재실행 idempotency.
drop policy if exists "assets member select" on storage.objects;
drop policy if exists "assets member insert" on storage.objects;
drop policy if exists "assets member update" on storage.objects;
drop policy if exists "assets member delete" on storage.objects;

create policy "assets member select" on storage.objects
  for select to authenticated
  using (bucket_id = 'assets'
         and (select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false);

create policy "assets member insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'assets'
              and (select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false);

-- upload(upsert: true) 는 기존 오브젝트 덮어쓰기에 update 권한도 필요.
create policy "assets member update" on storage.objects
  for update to authenticated
  using      (bucket_id = 'assets'
              and (select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false)
  with check (bucket_id = 'assets'
              and (select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false);

-- 앱은 에셋을 교체·해제할 때 로컬(IndexedDB)만 지우고 원격은 건드리지 않아서, 버킷이 단조 증가만
-- 했다(업로드 경로는 있는데 삭제 경로가 아예 없던 비대칭). "☁️ 협업 Storage 정리" 스윕
-- (store.deleteRemoteOrphanAssets → collab/assetsGc.ts)이 그걸 회수하는 유일한 경로이고,
-- 이 정책이 없으면 그 스윕이 RLS 403 으로 실패한다.
-- ⚠️ 스윕은 "어느 방의 프로젝트도 참조하지 않고 + 업로드 후 유예 기간이 지난" 오브젝트만
-- 고른다(유예는 기본 7일이고 UI 에서 1일·전체로 바꿀 수 있다 — REMOTE_GRACE_OPTIONS). Storage 키가 평면 구조라 방 구분이 없어서, 참조 집합을 projects 전 행에서 모으지 않으면
-- 남의 방이 쓰는 파일을 지운다 — 판정 로직을 손볼 땐 assetRefs.diffRemoteOrphans 의 주석을 먼저 볼 것.
create policy "assets member delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'assets'
         and (select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false);

-- ── 4. 적용 결과 검사(fail-closed) — 하나라도 어긋나면 raise → 트랜잭션 전체 rollback ──
do $$
declare n int;
begin
  -- (a) projects: anon/public 대상 정책 0 (TO 를 생략한 정책은 roles={public} = anon 포함)
  if exists (select 1 from pg_policies
              where schemaname = 'public' and tablename = 'projects'
                and roles && array['anon', 'public']::name[]) then
    raise exception 'S1-D1: projects 에 anon/public 정책이 남아 있다';
  end if;
  -- (b) storage.objects: anon/public 대상 정책 0 (전제: assets 외 버킷용 정책 없음 — 헤더 참고)
  if exists (select 1 from pg_policies
              where schemaname = 'storage' and tablename = 'objects'
                and roles && array['anon', 'public']::name[]) then
    raise exception 'S1-D1: storage.objects 에 anon/public 정책이 남아 있다';
  end if;
  -- (c) assets 버킷 존재 + 비공개
  if coalesce((select public from storage.buckets where id = 'assets'), true) then
    raise exception 'S1-D1: assets 버킷이 없거나 아직 public 이다';
  end if;
  -- (d) projects: member 정책 정확히 3개 · 전부 {authenticated} · 그 외 정책 없음
  select count(*) into n from pg_policies
   where schemaname = 'public' and tablename = 'projects'
     and policyname in ('collab member select', 'collab member insert', 'collab member update')
     and roles = array['authenticated']::name[];
  if n <> 3 then
    raise exception 'S1-D1: projects member 정책이 3개가 아니다(%)', n;
  end if;
  select count(*) into n from pg_policies where schemaname = 'public' and tablename = 'projects';
  if n <> 3 then
    raise exception 'S1-D1: projects 에 member 외 정책이 있다(총 %)', n;
  end if;
  -- (e) projects: DELETE 를 허용하는 정책 0 (DELETE 또는 ALL)
  if exists (select 1 from pg_policies
              where schemaname = 'public' and tablename = 'projects'
                and cmd in ('DELETE', 'ALL')) then
    raise exception 'S1-D1: projects 에 DELETE 를 허용하는 정책이 있다';
  end if;
  -- (f) storage.objects: assets member 정책 정확히 4개 · 전부 {authenticated}
  select count(*) into n from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname in ('assets member select', 'assets member insert', 'assets member update', 'assets member delete')
     and roles = array['authenticated']::name[];
  if n <> 4 then
    raise exception 'S1-D1: assets member 정책이 4개가 아니다(%)', n;
  end if;
  -- (g) storage.objects: 정책은 그 4개뿐 — 이름이 다른 authenticated 정책도 막는다. permissive 정책은 OR 로 합쳐져서
  --     비익명 조건이 없는 authenticated 정책 하나가 있으면 Supabase 익명 로그인 사용자(role = authenticated)가 그쪽으로 들어온다.
  select count(*) into n from pg_policies where schemaname = 'storage' and tablename = 'objects';
  if n <> 4 then
    raise exception 'S1-D1: storage.objects 에 assets member 외 정책이 있다(총 %)', n;
  end if;
end $$;

commit;

-- ───────────────────────────────────────────────────────────────────────────
--  ROLLBACK — application-compatibility rollback (비상용 · 평소엔 실행하지 않는다)
--
--  목적: 위 정책 때문에 **로그인한 앱의 협업이 깨졌을 때** 동작만 즉시 복구한다.
--  내용: member 정책을 지우고 S1-D1 이전의 개방 정책(to anon, authenticated)을 다시 만든다.
--  ⚠️ F-0(적용 전 live) 상태로의 exact rollback 이 **아니다** — assets 버킷 public=true 와 대시보드에서 만든
--     legacy "assets anon read/insert/update" 는 되살리지 않는다(앱은 public URL 을 쓰지 않는다).
--     그래도 개방 정책을 되살리는 순간 publishable key 만으로 REST/Storage 접근이 다시 열린다는 점을 알고 쓸 것.
--  실행하려면 아래 블록의 주석(`-- `)을 풀어서 SQL Editor 에서 실행한다.
--
-- begin;
-- drop policy if exists "collab member select" on public.projects;
-- drop policy if exists "collab member insert" on public.projects;
-- drop policy if exists "collab member update" on public.projects;
-- drop policy if exists "collab open select" on public.projects;
-- drop policy if exists "collab open insert" on public.projects;
-- drop policy if exists "collab open update" on public.projects;
-- create policy "collab open select" on public.projects
--   for select to anon, authenticated using (true);
-- create policy "collab open insert" on public.projects
--   for insert to anon, authenticated with check (true);
-- create policy "collab open update" on public.projects
--   for update to anon, authenticated using (true) with check (true);
-- drop policy if exists "assets member select" on storage.objects;
-- drop policy if exists "assets member insert" on storage.objects;
-- drop policy if exists "assets member update" on storage.objects;
-- drop policy if exists "assets member delete" on storage.objects;
-- drop policy if exists "assets open select" on storage.objects;
-- drop policy if exists "assets open insert" on storage.objects;
-- drop policy if exists "assets open update" on storage.objects;
-- drop policy if exists "assets open delete" on storage.objects;
-- create policy "assets open select" on storage.objects
--   for select to anon, authenticated using (bucket_id = 'assets');
-- create policy "assets open insert" on storage.objects
--   for insert to anon, authenticated with check (bucket_id = 'assets');
-- create policy "assets open update" on storage.objects
--   for update to anon, authenticated using (bucket_id = 'assets') with check (bucket_id = 'assets');
-- create policy "assets open delete" on storage.objects
--   for delete to anon, authenticated using (bucket_id = 'assets');
-- commit;
-- ───────────────────────────────────────────────────────────────────────────
