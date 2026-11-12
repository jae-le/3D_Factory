package com.kopens.factory3d.auth;

import java.time.OffsetDateTime;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface UserMapper {
    int count();

    int countEnabledAdmins();

    List<AppUser> findAll();

    AppUser findById(long id);

    AppUser findByUsername(String username);

    void insert(@Param("username") String username, @Param("displayName") String displayName,
            @Param("passwordHash") String passwordHash, @Param("role") Role role);

    void update(@Param("id") long id, @Param("displayName") String displayName, @Param("role") Role role,
            @Param("enabled") boolean enabled);

    void setPassword(@Param("id") long id, @Param("passwordHash") String passwordHash,
            @Param("mustChange") boolean mustChange);

    void loginFailed(@Param("id") long id, @Param("failedCount") int failedCount,
            @Param("lockedUntil") OffsetDateTime lockedUntil);

    void loginOk(long id);

    void delete(long id);
}
