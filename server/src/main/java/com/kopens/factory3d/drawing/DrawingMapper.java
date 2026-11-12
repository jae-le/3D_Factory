package com.kopens.factory3d.drawing;

import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface DrawingMapper {
    List<DrawingSummary> findAll();

    DrawingDetail findById(long id);

    int count();

    boolean existsByName(@Param("name") String name, @Param("excludeId") Long excludeId);

    void insert(DrawingRow row);

    void setSourceFile(@Param("id") long id, @Param("sourceFile") String sourceFile);

    int updatePlan(@Param("id") long id, @Param("version") int version, @Param("plan") String plan,
            @Param("layerRules") String layerRules);

    void rename(@Param("id") long id, @Param("name") String name);

    void delete(long id);

    /** insert 용 (생성된 id 를 돌려받음) */
    final class DrawingRow {
        public Long id;
        public String name;
        public String sourceType;
        public String plan;
        public String layerRules;
        public String createdBy;
    }
}
