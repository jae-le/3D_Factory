-- Claude API 설정: 한 줄(id=1). 키는 AES-GCM 암호문(iv 12바이트 + 본문), 화면에는 key_hint 만
create table ai_setting (
    id                 int           primary key default 1 check (id = 1),
    api_key_enc        bytea,
    key_hint           varchar(16),
    model              varchar(40)   not null default 'claude-opus-5-5'
                       check (model in ('claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5')),
    monthly_limit_usd  numeric(10,2) not null default 50 check (monthly_limit_usd >= 0),
    enabled            boolean       not null default false,
    updated_by         varchar(32),
    updated_at         timestamptz   not null default now()
);
insert into ai_setting (id) values (1);

-- 호출마다 한 줄 (토큰·추정 비용). purpose: chat(챗봇) · test(연결 테스트) · vision(P7)
create table ai_usage (
    id                  bigserial     primary key,
    at                  timestamptz   not null default now(),
    username            varchar(32),
    drawing_id          bigint        references drawing (id) on delete set null,
    model               varchar(40)   not null,
    input_tokens        bigint        not null default 0,
    output_tokens       bigint        not null default 0,
    cache_read_tokens   bigint        not null default 0,
    cache_write_tokens  bigint        not null default 0,
    cost_usd            numeric(12,6) not null default 0,
    purpose             varchar(16)   not null check (purpose in ('chat', 'test', 'vision'))
);
create index ai_usage_at on ai_usage (at);

-- 변경 이력 (사람/AI). batch_id = 한 번에 바뀐 묶음(AI 제안 묶음 id, 사람 편집 1회). target_key = 되돌리기 충돌 검사용
-- (placement:<id> · station:<id> · partition:<id> · zone:<id>)
create table change_log (
    id           bigserial    primary key,
    at           timestamptz  not null default now(),
    username     varchar(32),
    source       varchar(4)   not null check (source in ('USER', 'AI')),
    drawing_id   bigint       not null references drawing (id) on delete cascade,
    batch_id     uuid         not null,
    kind         varchar(32)  not null,
    target       varchar(100),
    target_key   varchar(64)  not null,
    before       jsonb,
    after        jsonb,
    reverted     boolean      not null default false,
    reverted_by  varchar(32),
    reverted_at  timestamptz
);
create index change_log_drawing on change_log (drawing_id, id desc);
create index change_log_batch on change_log (batch_id);
create index change_log_target on change_log (drawing_id, target_key, id);
