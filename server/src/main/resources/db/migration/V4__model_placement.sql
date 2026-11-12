-- 공용 3D 모델 라이브러리 (항상 glb, m 단위, 바닥 중심 원점, 앞쪽 +X)
create table model (
    id          bigserial    primary key,
    name        varchar(100) not null unique,
    category    varchar(8)   not null check (category in ('equip', 'mat', 'mover')),
    file        varchar(300) not null default '',
    source_ext  varchar(8)   not null,
    size_x      double precision not null check (size_x > 0),
    size_y      double precision not null check (size_y > 0),
    size_z      double precision not null check (size_z > 0),
    thumbnail   varchar(300) not null default '',
    aliases     text[]       not null default '{}',
    version     int          not null default 1,
    created_by  varchar(32),
    created_at  timestamptz  not null default now(),
    updated_at  timestamptz  not null default now()
);

-- 도면별 배치 (plan 좌표 m, rot 도·반시계). 모델이 지워지면 임시 상자(model_id null)
create table placement (
    id          bigserial    primary key,
    drawing_id  bigint       not null references drawing (id) on delete cascade,
    model_id    bigint       references model (id) on delete set null,
    name        varchar(100) not null,
    x           double precision not null,
    y           double precision not null,
    rot         double precision not null default 0,
    hint_label  varchar(100),
    created_at  timestamptz  not null default now(),
    updated_at  timestamptz  not null default now(),
    unique (drawing_id, name)
);
create index placement_drawing on placement (drawing_id);
