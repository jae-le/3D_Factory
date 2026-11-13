-- PJT (제작 현황): 도면별. 상황판 서랍의 제작 현황 표 · 메인 스테이션 칩의 'PJT #호기'
create table project (
    id          bigserial    primary key,
    drawing_id  bigint       not null references drawing (id) on delete cascade,
    name        varchar(100) not null,
    done        int          not null default 0,
    total       int          not null,
    period      varchar(40),
    state       varchar(8)   not null default 'run' check (state in ('run', 'wait', 'done')),
    sort_order  int          not null default 0,
    check (total >= 1 and done >= 0 and done <= total),
    unique (drawing_id, name)
);

-- 공정 기준정보: sort_order = 칩 번호 1..n, placement_name = 칩을 붙일 같은 도면의 배치 이름
create table station (
    id              bigserial    primary key,
    drawing_id      bigint       not null references drawing (id) on delete cascade,
    sort_order      int          not null,
    name            varchar(100) not null,
    placement_name  varchar(100),
    steps           text[]       not null check (cardinality(steps) between 1 and 40),
    takt_sec        int          not null default 1200 check (takt_sec between 60 and 604800),
    warn_pp         int          not null default 10,
    delay_pp        int          not null default 20,
    project_id      bigint       references project (id) on delete set null,
    counts_project  boolean      not null default false,
    materials       text[]       not null default '{}',
    check (warn_pp >= 0 and warn_pp < delay_pp and delay_pp <= 100),
    unique (drawing_id, name)
);
create index station_drawing on station (drawing_id, sort_order);

-- 오늘 완료 수 (factory3d.time-zone 날짜). 진행 상태는 메모리, 이 값과 project.done 만 DB
create table live_daily (
    drawing_id  bigint not null references drawing (id) on delete cascade,
    day         date   not null,
    done        int    not null default 0,
    primary key (drawing_id, day)
);
