package com.kopens.factory3d.loginhistory;

import com.kopens.factory3d.common.BadRequestException;
import jakarta.servlet.http.HttpServletRequest;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/** 로그인 이력 남기기·찾기. IP·브라우저는 지금 요청에서 */
@Service
public class LoginHistoryService {
    public static final Set<String> RESULTS = Set.of("OK", "FAIL", "LOCKED", "LOGOUT");

    private final LoginHistoryMapper mapper;
    private final ZoneId zone;

    public LoginHistoryService(LoginHistoryMapper mapper, @Value("${factory3d.time-zone:Asia/Seoul}") String zone) {
        this.mapper = mapper;
        this.zone = ZoneId.of(zone);
    }

    public void record(String username, String result, String detail) {
        HttpServletRequest req = RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes r
                ? r.getRequest()
                : null;
        String ip = req == null ? null : req.getRemoteAddr();
        String ua = req == null ? null : req.getHeader("User-Agent");
        if (ua != null && ua.length() > 300) ua = ua.substring(0, 300);
        String name = username == null || username.isBlank() ? null : username.substring(0, Math.min(32, username.length()));
        mapper.insert(name, result, detail, ip, ua);
    }

    /** from·to 는 이 시간대의 날짜. to 는 그날 끝까지 포함 */
    public List<LoginEvent> find(String username, String result, LocalDate from, LocalDate to, int limit) {
        String r = blank(result);
        if (r != null && !RESULTS.contains(r)) throw new BadRequestException("결과는 OK, FAIL, LOCKED, LOGOUT 중 하나입니다.");
        OffsetDateTime f = from == null ? null : from.atStartOfDay(zone).toOffsetDateTime();
        OffsetDateTime t = to == null ? null : to.plusDays(1).atStartOfDay(zone).toOffsetDateTime();
        return mapper.find(lower(blank(username)), r, f, t, Math.max(1, Math.min(limit, 1000)));
    }

    private static String lower(String s) {
        return s == null ? null : s.toLowerCase();
    }

    private static String blank(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
