-- Gemini 모델도 저장할 수 있게 (이름이 자주 바뀌어 형식만 검사)
alter table ai_setting drop constraint ai_setting_model_check;
alter table ai_setting add constraint ai_setting_model_check
    check (model in ('claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5') or model ~ '^gemini-[a-z0-9][a-z0-9.-]{0,32}$');
