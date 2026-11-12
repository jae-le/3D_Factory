-- 로그인 이력: 성공·실패·잠김·로그아웃, 어디서(IP)·무엇으로(브라우저)
create table login_history (
    id         bigserial    primary key,
    at         timestamptz  not null default now(),
    username   varchar(32),
    result     varchar(16)  not null check (result in ('OK', 'FAIL', 'LOCKED', 'LOGOUT')),
    detail     varchar(200),
    ip         varchar(64),
    user_agent varchar(300)
);
create index login_history_at on login_history (at desc);
create index login_history_user on login_history (username, at desc);
