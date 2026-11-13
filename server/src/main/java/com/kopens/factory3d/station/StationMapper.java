package com.kopens.factory3d.station;

import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface StationMapper {
    List<StationView> findByDrawing(long drawingId);

    StationView findById(long id);

    Long drawingOf(long id);

    int countByDrawing(long drawingId);

    boolean existsByName(@Param("drawingId") long drawingId, @Param("name") String name, @Param("excludeId") Long excludeId);

    void insert(@Param("drawingId") long drawingId, @Param("row") Row row);

    void update(@Param("id") long id, @Param("row") Row row);

    void setOrder(@Param("id") long id, @Param("no") int no);

    void delete(long id);

    /** 추가·수정용 (no = sort_order) */
    final class Row {
        public Long id;
        public int no;
        public String name;
        public String placementName;
        public String[] steps;
        public int taktSec;
        public int warnPp;
        public int delayPp;
        public Long projectId;
        public boolean countsProject;
        public String[] materials;
    }
}
