package com.kopens.factory3d.model;

import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface ModelMapper {
    List<ModelInfo> findAll();

    ModelInfo findById(long id);

    Long findIdByName(String name);

    int count();

    boolean existsByName(@Param("name") String name, @Param("excludeId") Long excludeId);

    void insert(ModelRow row);

    void setFiles(@Param("id") long id, @Param("file") String file, @Param("thumbnail") String thumbnail);

    void update(@Param("id") long id, @Param("name") String name, @Param("category") String category,
            @Param("aliases") String[] aliases);

    void replaceFile(@Param("id") long id, @Param("sourceExt") String sourceExt, @Param("sx") double sx,
            @Param("sy") double sy, @Param("sz") double sz);

    void delete(long id);

    final class ModelRow {
        public Long id;
        public String name;
        public String category;
        public String sourceExt;
        public double sizeX;
        public double sizeY;
        public double sizeZ;
        public String[] aliases;
        public String createdBy;
    }
}
