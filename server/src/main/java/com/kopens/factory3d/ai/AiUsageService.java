package com.kopens.factory3d.ai;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/** Claude 호출 사용량 (호출마다 한 줄) · 이번 달 합계 (factory3d.time-zone 기준 달) */
@Service
public class AiUsageService {
    private final AiUsageMapper mapper;
    private final ZoneId zone;

    public AiUsageService(AiUsageMapper mapper, @Value("${factory3d.time-zone:Asia/Seoul}") String zone) {
        this.mapper = mapper;
        this.zone = ZoneId.of(zone);
    }

    /** 기록하고 추정 비용(USD)을 돌려줌 */
    public BigDecimal record(String username, Long drawingId, String model, long input, long output, long cacheRead,
            long cacheWrite, String purpose) {
        var r = new AiUsageMapper.Row();
        r.username = username == null ? null : username.substring(0, Math.min(32, username.length()));
        r.drawingId = drawingId;
        r.model = model;
        r.inputTokens = input;
        r.outputTokens = output;
        r.cacheReadTokens = cacheRead;
        r.cacheWriteTokens = cacheWrite;
        r.costUsd = Pricing.cost(model, input, output, cacheRead, cacheWrite);
        r.purpose = purpose;
        mapper.insert(r);
        return r.costUsd;
    }

    public BigDecimal monthCost() {
        OffsetDateTime[] m = monthRange();
        return mapper.sumCost(m[0], m[1]);
    }

    /** [이번 달 1일 0시, 다음 달 1일 0시) */
    public OffsetDateTime[] monthRange() {
        LocalDate first = LocalDate.now(zone).withDayOfMonth(1);
        return new OffsetDateTime[] {first.atStartOfDay(zone).toOffsetDateTime(), first.plusMonths(1).atStartOfDay(zone).toOffsetDateTime()};
    }

    ZoneId zone() {
        return zone;
    }

    AiUsageMapper mapper() {
        return mapper;
    }
}
