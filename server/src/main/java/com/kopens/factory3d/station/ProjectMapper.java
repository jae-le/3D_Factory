package com.kopens.factory3d.station;

import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface ProjectMapper {
    List<ProjectView> findByDrawing(long drawingId);

    ProjectView findById(long id);

    Long drawingOf(long id);

    int countByDrawing(long drawingId);

    boolean existsByName(@Param("drawingId") long drawingId, @Param("name") String name, @Param("excludeId") Long excludeId);

    int nextOrder(long drawingId);

    void insert(@Param("drawingId") long drawingId, @Param("row") Row row);

    void update(@Param("id") long id, @Param("row") Row row);

    /** 상황판 한 대 완료 (VirtualMes) — done 은 늘리기만, total 을 넘지 않음 */
    void setDone(@Param("id") long id, @Param("done") int done);

    void delete(long id);

    final class Row {
        public Long id;
        public String name;
        public int done;
        public int total;
        public String period;
        public String state;
        public int sortOrder;
    }
}
