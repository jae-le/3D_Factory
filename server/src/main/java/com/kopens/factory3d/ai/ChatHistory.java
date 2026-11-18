package com.kopens.factory3d.ai;

import java.time.OffsetDateTime;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/** 챗봇 대화 기록 (본인 것만 보임). 화면 표시용 — AI 가 기억하는 대화(서버 메모리)와는 별개. 90일 지나면 지움 */
@Service
public class ChatHistory {
    private static final Logger log = LoggerFactory.getLogger(ChatHistory.class);
    static final int KEEP_DAYS = 90;
    static final int MAX_ROWS = 200;

    public record Entry(long id, OffsetDateTime at, String role, String text, List<String> tools, String error) {}

    private final JdbcTemplate jdbc;

    public ChatHistory(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void add(String user, long drawingId, String role, String text, List<String> tools, String error) {
        try {
            jdbc.update("insert into ai_chat (username, drawing_id, role, text, tools, error) values (?, ?, ?, ?, ?, ?)",
                    cut(user, 32), drawingId, role, text == null ? "" : text,
                    tools == null || tools.isEmpty() ? null : String.join("\n", tools), error);
        } catch (RuntimeException e) {
            log.warn("대화 기록을 저장하지 못했습니다: {}", e.getMessage()); // 기록 실패로 챗봇이 멈추지 않게
        }
    }

    /** 새 대화 경계를 남김 (이전 대화는 화면에 다시 안 나옴, 기록은 남음) */
    public void newChat(String user, long drawingId) {
        add(user, drawingId, "new", "", null, null);
    }

    /** 지금 대화 = 마지막 '새 대화' 뒤의 질문·답 (최근 200개, 오래된 것부터) */
    public List<Entry> current(String user, long drawingId) {
        List<Entry> rows = jdbc.query("""
                select id, at, role, text, tools, error from ai_chat
                where username = ? and drawing_id = ? and role <> 'new'
                  and id > coalesce((select max(id) from ai_chat where username = ? and drawing_id = ? and role = 'new'), 0)
                order by id desc limit ?""",
                (rs, i) -> new Entry(rs.getLong("id"), rs.getObject("at", OffsetDateTime.class), rs.getString("role"), rs.getString("text"),
                        rs.getString("tools") == null ? List.of() : List.of(rs.getString("tools").split("\n")), rs.getString("error")),
                cut(user, 32), drawingId, cut(user, 32), drawingId, MAX_ROWS);
        return rows.reversed();
    }

    /** 매일 새벽 3시 반: 보관 기간이 지난 기록 지움 */
    @Scheduled(cron = "0 30 3 * * *")
    public void purge() {
        int n = jdbc.update("delete from ai_chat where at < now() - make_interval(days => ?)", KEEP_DAYS);
        if (n > 0) log.info("오래된 챗봇 대화 기록 {}줄을 지웠습니다 ({}일 지남)", n, KEEP_DAYS);
    }

    private static String cut(String s, int n) {
        return s == null ? null : s.substring(0, Math.min(n, s.length()));
    }
}
