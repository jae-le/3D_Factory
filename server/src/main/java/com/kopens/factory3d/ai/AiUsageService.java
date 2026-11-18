package com.kopens.factory3d.ai;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;
import com.kopens.factory3d.common.BadRequestException;
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

    /** Google 무료 등급 하루(RPD)는 미국 태평양 시간 자정에 초기화 */
    static final ZoneId GOOGLE_DAY = ZoneId.of("America/Los_Angeles");

    /** 이 모델의 오늘(태평양 시간) 호출 수 — 연결 테스트 포함 */
    public long todayCalls(String model) {
        return mapper.countCalls(model, LocalDate.now(GOOGLE_DAY).atStartOfDay(GOOGLE_DAY).toOffsetDateTime());
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

    public record Report(UsageRow month, BigDecimal limitUsd, List<UsageRow> rows, LocalDate from, LocalDate to, String group) {}

    /** 기간 [from, to] (날짜 포함) 일별·사용자별 + 이번 달 합계. 기본 = 이번 달 1일 ~ 오늘, day */
    public Report report(LocalDate from, LocalDate to, String group, BigDecimal limitUsd) {
        String g = group == null || group.isBlank() ? "day" : group;
        if (!g.equals("day") && !g.equals("user") && !g.equals("model")) throw new BadRequestException("group 은 day, user, model 중 하나입니다.");
        LocalDate today = LocalDate.now(zone);
        LocalDate f = from == null ? today.withDayOfMonth(1) : from;
        LocalDate t = to == null ? today : to;
        if (t.isBefore(f) || f.plusDays(366).isBefore(t)) throw new BadRequestException("기간이 올바르지 않습니다.");
        OffsetDateTime[] m = monthRange();
        UsageRow month = mapper.group("month", m[0], m[1], zone.getId()).getFirst();
        List<UsageRow> rows = mapper.group(g, f.atStartOfDay(zone).toOffsetDateTime(), t.plusDays(1).atStartOfDay(zone).toOffsetDateTime(),
                zone.getId());
        return new Report(month, limitUsd, rows, f, t, g);
    }

    ZoneId zone() {
        return zone;
    }

    AiUsageMapper mapper() {
        return mapper;
    }
}
