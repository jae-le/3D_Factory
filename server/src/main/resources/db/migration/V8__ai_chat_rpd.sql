-- 챗봇 대화 기록 (사용자·도면별, 90일 보관). role: user(질문) · ai(답) · new(새 대화 경계)
create table ai_chat (
    id          bigserial    primary key,
    at          timestamptz  not null default now(),
    username    varchar(32)  not null,
    drawing_id  bigint       not null references drawing (id) on delete cascade,
    role        varchar(8)   not null check (role in ('user', 'ai', 'new')),
    text        text         not null default '',
    tools       text,
    error       text
);
create index ai_chat_user_drawing on ai_chat (username, drawing_id, id);
create index ai_chat_at on ai_chat (at);

-- Gemini 무료 등급 하루 요청 한도 (RPD, 모델별 · 미국 태평양 시간 자정에 초기화)
alter table ai_setting add column gemini_daily_limit int not null default 500 check (gemini_daily_limit >= 0);
