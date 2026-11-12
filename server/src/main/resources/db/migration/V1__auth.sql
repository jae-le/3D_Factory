-- 사용자 (플랫폼 자체 계정, 나중에 AD/LDAP 은 auth_source 로 구분)
create table app_user (
    id                   bigserial    primary key,
    username             varchar(32)  not null unique,
    display_name         varchar(100) not null,
    password_hash        varchar(200) not null,
    role                 varchar(16)  not null check (role in ('ADMIN', 'OPERATOR', 'VIEWER')),
    enabled              boolean      not null default true,
    must_change_password boolean      not null default true,
    failed_count         int          not null default 0,
    locked_until         timestamptz,
    last_login_at        timestamptz,
    auth_source          varchar(16)  not null default 'local',
    created_at           timestamptz  not null default now(),
    updated_at           timestamptz  not null default now()
);

-- 감사 기록: 누가 언제 무엇을
create table audit_log (
    id       bigserial    primary key,
    at       timestamptz  not null default now(),
    username varchar(32),
    action   varchar(32)  not null,
    target   varchar(200),
    detail   text,
    ip       varchar(64)
);
create index audit_log_at on audit_log (at desc);

-- Spring Session JDBC (표준 구조)
create table spring_session (
    primary_id            char(36)     not null,
    session_id            char(36)     not null,
    creation_time         bigint       not null,
    last_access_time      bigint       not null,
    max_inactive_interval int          not null,
    expiry_time           bigint       not null,
    principal_name        varchar(100),
    constraint spring_session_pk primary key (primary_id)
);
create unique index spring_session_ix1 on spring_session (session_id);
create index spring_session_ix2 on spring_session (expiry_time);
create index spring_session_ix3 on spring_session (principal_name);

create table spring_session_attributes (
    session_primary_id char(36)     not null,
    attribute_name     varchar(200) not null,
    attribute_bytes    bytea        not null,
    constraint spring_session_attributes_pk primary key (session_primary_id, attribute_name),
    constraint spring_session_attributes_fk foreign key (session_primary_id) references spring_session (primary_id) on delete cascade
);
