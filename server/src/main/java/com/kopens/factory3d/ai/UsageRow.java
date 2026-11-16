package com.kopens.factory3d.ai;

import java.math.BigDecimal;

/** 사용량 묶음 한 줄 (key = 날짜 YYYY-MM-DD · 사용자 · 'month') */
public record UsageRow(String key, long calls, long inputTokens, long outputTokens, long cacheReadTokens, long cacheWriteTokens,
        BigDecimal costUsd) {}
