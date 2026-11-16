package com.kopens.factory3d.ai;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface AiUsageMapper {
    void insert(@Param("r") Row r);

    BigDecimal sumCost(@Param("from") OffsetDateTime from, @Param("to") OffsetDateTime to);

    /** by = day | user | month(전체 한 줄) */
    List<UsageRow> group(@Param("by") String by, @Param("from") OffsetDateTime from, @Param("to") OffsetDateTime to,
            @Param("zone") String zone);

    final class Row {
        public String username;
        public Long drawingId;
        public String model;
        public long inputTokens;
        public long outputTokens;
        public long cacheReadTokens;
        public long cacheWriteTokens;
        public BigDecimal costUsd;
        public String purpose;
    }
}
