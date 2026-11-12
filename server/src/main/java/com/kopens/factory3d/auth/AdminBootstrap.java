package com.kopens.factory3d.auth;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/** 첫 실행(사용자 0명) 때 admin 계정을 만든다. 첫 로그인 때 비밀번호 변경 강제 */
@Component
@Order(0)
public class AdminBootstrap implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(AdminBootstrap.class);
    private final UserMapper users;
    private final PasswordEncoder encoder;
    private final String configured;

    public AdminBootstrap(UserMapper users, PasswordEncoder encoder, @Value("${factory3d.admin-password:}") String configured) {
        this.users = users;
        this.encoder = encoder;
        this.configured = configured;
    }

    @Override
    public void run(ApplicationArguments args) {
        createFirstAdmin(configured);
    }

    /** 만들었으면 쓴 비밀번호, 이미 사용자가 있으면 null */
    public String createFirstAdmin(String password) {
        if (users.count() > 0) return null;
        boolean generated = password == null || password.isBlank();
        String pwd = generated ? PasswordPolicy.temporary() : password;
        users.insert("admin", "관리자", encoder.encode(pwd), Role.ADMIN);
        if (generated)
            log.warn("처음 관리자 계정을 만들었습니다 — 아이디 admin / 임시 비밀번호 {} (첫 로그인 때 바꿔야 합니다)", pwd);
        else log.info("처음 관리자 계정을 만들었습니다 — 아이디 admin / 비밀번호는 F3D_ADMIN_PASSWORD (첫 로그인 때 바꿔야 합니다)");
        return pwd;
    }
}
