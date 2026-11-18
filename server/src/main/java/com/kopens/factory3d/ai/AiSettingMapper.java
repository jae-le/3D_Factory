package com.kopens.factory3d.ai;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface AiSettingMapper {
    /** 한 줄(id=1)이 없으면 기본값으로 넣음 (테스트가 표를 비워도 동작) */
    void ensureRow();

    Row find();

    void updateKey(@Param("enc") byte[] enc, @Param("hint") String hint, @Param("by") String by);

    void update(@Param("model") String model, @Param("limit") BigDecimal limit, @Param("enabled") boolean enabled,
            @Param("daily") int daily, @Param("by") String by);

    final class Row {
        public byte[] apiKeyEnc;
        public String keyHint;
        public String model;
        public BigDecimal monthlyLimitUsd;
        public boolean enabled;
        public int geminiDailyLimit;
        public String updatedBy;
        public OffsetDateTime updatedAt;
    }
}
