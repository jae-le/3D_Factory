package com.kopens.factory3d.placement;

import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface PlacementMapper {
    List<PlacementView> findByDrawing(long drawingId);

    PlacementView findById(long id);

    Long drawingOf(long id);

    int countByDrawing(long drawingId);

    int countNames(@Param("drawingId") long drawingId, @Param("names") List<String> names, @Param("excludeId") Long excludeId);

    void insert(@Param("drawingId") long drawingId, @Param("row") NewRow row);

    void update(@Param("id") long id, @Param("modelId") Long modelId, @Param("name") String name, @Param("x") double x,
            @Param("y") double y, @Param("rot") double rot);

    void scale(@Param("drawingId") long drawingId, @Param("k") double k);

    void delete(long id);

    final class NewRow {
        public Long id;
        public Long modelId;
        public String name;
        public double x;
        public double y;
        public double rot;
        public String hintLabel;
    }
}
