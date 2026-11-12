package com.kopens.factory3d.audit;

import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface AuditMapper {
    void insert(@Param("username") String username, @Param("action") String action, @Param("target") String target,
            @Param("detail") String detail, @Param("ip") String ip);

    List<AuditEntry> findRecent(int limit);
}
