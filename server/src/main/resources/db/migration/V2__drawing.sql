-- 도면: 원본 파일 + 해석 결과(plan). P1 은 목록만, 업로드·해석은 P2
create table drawing (
    id          bigserial    primary key,
    name        varchar(100) not null,
    source_type varchar(8)   not null check (source_type in ('dxf', 'image')),
    source_file varchar(300) not null,
    plan        jsonb        not null default '{}'::jsonb,
    layer_rules jsonb        not null default '{}'::jsonb,
    version     int          not null default 1,
    created_by  varchar(32),
    created_at  timestamptz  not null default now(),
    updated_at  timestamptz  not null default now()
);
