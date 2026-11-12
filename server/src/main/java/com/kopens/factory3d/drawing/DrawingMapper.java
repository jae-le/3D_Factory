package com.kopens.factory3d.drawing;

import java.util.List;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface DrawingMapper {
    List<DrawingSummary> findAll();
}
