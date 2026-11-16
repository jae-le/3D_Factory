package com.kopens.factory3d.change;

import com.kopens.factory3d.common.BadRequestException;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** 변경 이력 (사람 USER · AI). 기록은 부르는 쪽 트랜잭션 안에서 */
@Service
public class ChangeLogService {
    public static final int PAGE_SIZE = 50;

    public record Page(List<ChangeEntry> items, long total, int page, int size) {}

    private final ChangeLogMapper mapper;
    private final ObjectMapper json;
    private final ZoneId zone;

    public ChangeLogService(ChangeLogMapper mapper, ObjectMapper json, @Value("${factory3d.time-zone:Asia/Seoul}") String zone) {
        this.mapper = mapper;
        this.json = json;
        this.zone = ZoneId.of(zone);
    }

    public static String newBatch() {
        return UUID.randomUUID().toString();
    }

    public static String currentUser() {
        Authentication a = SecurityContextHolder.getContext().getAuthentication();
        return a == null || !a.isAuthenticated() ? null : a.getName();
    }

    private static final java.util.regex.Pattern UUID_RE =
            java.util.regex.Pattern.compile("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$");

    public static boolean isUuid(String s) {
        return s != null && UUID_RE.matcher(s).matches();
    }

    public long record(String username, String source, long drawingId, String batchId, String kind, String target, String targetKey,
            Object before, Object after) {
        var r = new ChangeLogMapper.Row();
        r.username = username == null ? null : username.substring(0, Math.min(32, username.length()));
        r.source = source;
        r.drawingId = drawingId;
        r.batchId = batchId;
        r.kind = kind;
        r.target = target == null ? null : target.substring(0, Math.min(100, target.length()));
        r.targetKey = targetKey;
        r.before = toJson(before);
        r.after = toJson(after);
        mapper.insert(r);
        return r.id;
    }

    public Page list(Long drawingId, String source, LocalDate from, LocalDate to, int page) {
        if (source != null && !source.isBlank() && !List.of("USER", "AI").contains(source))
            throw new BadRequestException("출처는 USER 또는 AI 입니다.");
        int p = Math.max(0, page);
        var f = new ChangeLogMapper.Filter(drawingId, source == null || source.isBlank() ? null : source,
                from == null ? null : start(from), to == null ? null : start(to.plusDays(1)));
        return new Page(mapper.find(f, PAGE_SIZE, p * PAGE_SIZE), mapper.count(f), p, PAGE_SIZE);
    }

    public List<ChangeEntry> batch(String batchId) {
        return isUuid(batchId) ? mapper.findBatch(batchId) : List.of();
    }

    public ChangeLogMapper mapper() {
        return mapper;
    }

    private OffsetDateTime start(LocalDate d) {
        return d.atStartOfDay(zone).toOffsetDateTime();
    }

    private String toJson(Object o) {
        if (o == null) return null;
        if (o instanceof JsonNode n) return n.isNull() || n.isMissingNode() ? null : n.toString();
        return json.writeValueAsString(o);
    }
}
