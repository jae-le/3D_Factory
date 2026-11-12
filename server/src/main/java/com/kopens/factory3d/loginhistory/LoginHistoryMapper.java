package com.kopens.factory3d.loginhistory;

import java.time.OffsetDateTime;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface LoginHistoryMapper {
    void insert(@Param("username") String username, @Param("result") String result, @Param("detail") String detail,
            @Param("ip") String ip, @Param("userAgent") String userAgent);

    List<LoginEvent> find(@Param("username") String username, @Param("result") String result,
            @Param("from") OffsetDateTime from, @Param("to") OffsetDateTime to, @Param("limit") int limit);
}
