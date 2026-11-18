package com.kopens.factory3d.ai;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Map;

/** 추정 비용 (USD / 1M 토큰). 캐시 쓰기 = 5분 캐시(입력의 1.25배). 표에 없는 모델(fallback 등)은 Opus 5.5 가격 */
public final class Pricing {
    public record Rate(double input, double output, double cacheRead, double cacheWrite) {}

    static final Map<String, Rate> RATES = Map.of(
            "claude-opus-5-5", new Rate(4, 20, 0.20, 5),
            "claude-sonnet-5-5", new Rate(2, 10, 0.10, 2.5),
            "claude-haiku-5-5", new Rate(0.10, 0.50, 0.01, 0.125));

    private Pricing() {}

    public static BigDecimal cost(String model, long input, long output, long cacheRead, long cacheWrite) {
        if (RoutingGateway.isGemini(model)) return BigDecimal.ZERO.setScale(6); // Gemini 무료 등급: 비용 0 (토큰만 셈)
        Rate r = RATES.getOrDefault(model, RATES.get("claude-opus-5-5"));
        double usd = (input * r.input() + output * r.output() + cacheRead * r.cacheRead() + cacheWrite * r.cacheWrite()) / 1_000_000d;
        return BigDecimal.valueOf(usd).setScale(6, RoundingMode.HALF_UP);
    }
}
