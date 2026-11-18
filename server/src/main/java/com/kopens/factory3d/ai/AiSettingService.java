package com.kopens.factory3d.ai;

import com.kopens.factory3d.audit.AuditService;
import com.kopens.factory3d.common.BadRequestException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.OffsetDateTime;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** AI API 관리(Claude · Gemini): 키(암호화·힌트) · 모델 · 월 한도 · 사용 여부 · 챗봇 상태 */
@Service
public class AiSettingService {
    public static final List<String> MODELS = List.of("claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5");
    /** Gemini 는 이름이 자주 바뀌어 형식만 검사 (gemini-2.5-flash 등) */
    static final java.util.regex.Pattern GEMINI = java.util.regex.Pattern.compile("gemini-[a-z0-9][a-z0-9.-]{0,32}");
    static final BigDecimal MAX_LIMIT = new BigDecimal("99999999.99");

    /** 화면용 (키 평문은 절대 넣지 않음) */
    public record View(boolean hasKey, String keyHint, String model, BigDecimal monthlyLimitUsd, boolean enabled, boolean masterKey,
            String updatedBy, OffsetDateTime updatedAt) {}

    public record Update(String model, BigDecimal monthlyLimitUsd, Boolean enabled) {}

    public record Status(boolean enabled, String reason) {}

    /** 호출에 쓸 값 — 서버 안에서만 */
    public record Active(String apiKey, String model) {}

    private final AiSettingMapper mapper;
    private final KeyCrypto crypto;
    private final AiUsageService usage;
    private final AuditService audit;

    public AiSettingService(AiSettingMapper mapper, KeyCrypto crypto, AiUsageService usage, AuditService audit) {
        this.mapper = mapper;
        this.crypto = crypto;
        this.usage = usage;
        this.audit = audit;
    }

    public View view() {
        AiSettingMapper.Row r = row();
        return new View(r.apiKeyEnc != null, r.keyHint, r.model, r.monthlyLimitUsd, r.enabled, crypto.available(), r.updatedBy, r.updatedAt);
    }

    @Transactional
    public View update(Update u, String by) {
        AiSettingMapper.Row r = row();
        String model = u.model() == null ? r.model : u.model().strip();
        if (!MODELS.contains(model) && !GEMINI.matcher(model).matches())
            throw new BadRequestException("모델은 claude-opus-5-5, claude-sonnet-5-5, claude-haiku-5-5 또는 gemini-로 시작하는 이름입니다.");
        BigDecimal limit = u.monthlyLimitUsd() == null ? r.monthlyLimitUsd : u.monthlyLimitUsd();
        if (limit.signum() < 0 || limit.compareTo(MAX_LIMIT) > 0) throw new BadRequestException("월 한도는 0 이상 USD 로 입력하세요.");
        boolean enabled = u.enabled() == null ? r.enabled : u.enabled();
        limit = limit.setScale(2, RoundingMode.HALF_UP);
        mapper.update(model, limit, enabled, by);
        audit.log("AI_SETTING", model, "limit=" + limit.toPlainString() + " enabled=" + enabled);
        return view();
    }

    @Transactional
    public View setKey(String apiKey, String by) {
        String k = apiKey == null ? "" : apiKey.strip();
        if (k.length() < 20 || k.length() > 300 || k.chars().anyMatch(Character::isWhitespace))
            throw new BadRequestException("API 키 형식이 올바르지 않습니다.");
        byte[] enc = crypto.encrypt(k); // 마스터 키가 없으면 400 (NO_MASTER)
        String hint = (k.startsWith("sk-ant-") ? "sk-ant-" : k.startsWith("AIza") ? "AIza" : "") + "…" + k.substring(k.length() - 4);
        row();
        mapper.updateKey(enc, hint, by);
        audit.log("AI_KEY_SET", hint, null);
        return view();
    }

    @Transactional
    public View deleteKey(String by) {
        row();
        mapper.updateKey(null, null, by);
        audit.log("AI_KEY_DELETE", null, null);
        return view();
    }

    public Status status() {
        AiSettingMapper.Row r = row();
        boolean overLimit = usage.monthCost().compareTo(r.monthlyLimitUsd) >= 0;
        String reason = reason(crypto.available(), r.apiKeyEnc != null, r.enabled, overLimit);
        return new Status(reason == null, reason);
    }

    /** 키·모델 (평문). 마스터 키·키가 없으면 400 */
    public Active requireKey() {
        AiSettingMapper.Row r = row();
        if (!crypto.available()) throw new BadRequestException(KeyCrypto.NO_MASTER);
        if (r.apiKeyEnc == null) throw new BadRequestException("AI API 키가 등록되지 않았습니다.");
        try {
            return new Active(crypto.decrypt(r.apiKeyEnc), r.model);
        } catch (IllegalStateException e) {
            throw new BadRequestException("저장된 API 키를 풀지 못했습니다. 마스터 키가 바뀌었다면 키를 다시 등록하세요.");
        }
    }

    /** 챗봇을 막는 이유 (null = 쓸 수 있음). 순서: 마스터 키 → 키 → 사용 여부 → 월 한도 */
    static String reason(boolean masterKey, boolean hasKey, boolean enabled, boolean overLimit) {
        if (!masterKey) return "no-master-key";
        if (!hasKey) return "no-key";
        if (!enabled) return "disabled";
        if (overLimit) return "over-limit";
        return null;
    }

    public static String reasonText(String reason) {
        return switch (reason == null ? "" : reason) {
            case "no-master-key" -> "서버에 F3D_AI_MASTER_KEY 가 설정되지 않았습니다";
            case "no-key" -> "AI API 키가 등록되지 않았습니다 (관리자 › AI API 관리)";
            case "disabled" -> "AI 챗봇이 사용 중지되어 있습니다 (관리자 › AI API 관리)";
            case "over-limit" -> "이번 달 AI 사용 한도를 넘었습니다";
            default -> "AI 챗봇을 쓸 수 없습니다";
        };
    }

    private AiSettingMapper.Row row() {
        mapper.ensureRow();
        return mapper.find();
    }
}
