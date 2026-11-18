package com.kopens.factory3d.ai;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import org.junit.jupiter.api.Test;

class PricingTest {
    @Test
    void 모델별_백만_토큰_가격() {
        assertThat(Pricing.cost("claude-opus-5-5", 1_000_000, 0, 0, 0)).isEqualByComparingTo("4");
        assertThat(Pricing.cost("claude-opus-5-5", 0, 1_000_000, 0, 0)).isEqualByComparingTo("20");
        assertThat(Pricing.cost("claude-opus-5-5", 0, 0, 1_000_000, 1_000_000)).isEqualByComparingTo("5.20");
        assertThat(Pricing.cost("claude-sonnet-5-5", 1_000_000, 1_000_000, 1_000_000, 1_000_000)).isEqualByComparingTo("14.60");
        assertThat(Pricing.cost("claude-haiku-5-5", 1_000_000, 1_000_000, 1_000_000, 1_000_000)).isEqualByComparingTo("0.735");
    }

    @Test
    void 작은_호출은_소수_6자리_모르는_모델은_opus_가격() {
        BigDecimal c = Pricing.cost("claude-opus-5-5", 1200, 60, 0, 1000);
        assertThat(c.scale()).isEqualTo(6);
        assertThat(c).isEqualByComparingTo("0.011000"); // 1200×4 + 60×20 + 1000×5 = 11000 / 1M
        assertThat(Pricing.cost("claude-opus-4-8", 1_000_000, 0, 0, 0)).isEqualByComparingTo("4"); // fallback 모델 등
    }

    @Test
    void Gemini_무료_등급은_비용_0() {
        assertThat(Pricing.cost("gemini-2.5-flash", 1_000_000, 1_000_000, 0, 0)).isEqualByComparingTo("0");
    }
}
