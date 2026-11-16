package com.kopens.factory3d.change;

import java.time.OffsetDateTime;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface ChangeLogMapper {
    void insert(@Param("r") Row r);

    List<ChangeEntry> find(@Param("f") Filter f, @Param("limit") int limit, @Param("offset") int offset);

    long count(@Param("f") Filter f);

    List<ChangeEntry> findBatch(@Param("batchId") String batchId);

    /** 이 묶음 뒤(id &gt; afterId)에 같은 대상(keys)을 바꾼, 되돌리지 않은 다른 묶음의 기록 수 */
    int countLater(@Param("drawingId") long drawingId, @Param("keys") List<String> keys, @Param("afterId") long afterId,
            @Param("batchId") String batchId);

    void markReverted(@Param("batchId") String batchId, @Param("by") String by);

    final class Row {
        public Long id;
        public String username;
        public String source;
        public long drawingId;
        public String batchId;
        public String kind;
        public String target;
        public String targetKey;
        public String before;
        public String after;
    }

    record Filter(Long drawingId, String source, OffsetDateTime from, OffsetDateTime to) {}
}
