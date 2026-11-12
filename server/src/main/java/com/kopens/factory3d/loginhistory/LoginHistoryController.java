package com.kopens.factory3d.loginhistory;

import java.time.LocalDate;
import java.util.List;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** 관리자 › 로그인 이력 (ADMIN — SecurityConfig 의 /api/admin/**) */
@RestController
public class LoginHistoryController {
    private final LoginHistoryService history;

    public LoginHistoryController(LoginHistoryService history) {
        this.history = history;
    }

    @GetMapping("/api/admin/login-history")
    public List<LoginEvent> find(
            @RequestParam(required = false) String username,
            @RequestParam(required = false) String result,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(defaultValue = "200") int limit) {
        return history.find(username, result, from, to, limit);
    }
}
