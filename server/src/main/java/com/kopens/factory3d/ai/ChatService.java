package com.kopens.factory3d.ai;

import com.kopens.factory3d.ai.ClaudeGateway.Call;
import com.kopens.factory3d.ai.ClaudeGateway.Stop;
import com.kopens.factory3d.ai.ClaudeGateway.ToolCall;
import com.kopens.factory3d.ai.ClaudeGateway.ToolResult;
import com.kopens.factory3d.ai.ClaudeGateway.Turn;
import com.kopens.factory3d.common.BadRequestException;
import com.kopens.factory3d.drawing.DrawingDetail;
import com.kopens.factory3d.drawing.DrawingMapper;
import java.math.BigDecimal;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/** AI 챗봇 한 요청: 사용자 글 → (Claude ↔ 도구)* → 제안 묶음. 쓰기 도구는 제안만 쌓음 */
@Service
public class ChatService {
    private static final Logger log = LoggerFactory.getLogger(ChatService.class);
    private static final DateTimeFormatter WHEN = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");

    public record Done(long inputTokens, long outputTokens, long cacheReadTokens, long cacheWriteTokens, BigDecimal costUsd) {}

    private final AiSettingService settings;
    private final AiUsageService usage;
    private final ClaudeGateway gateway;
    private final SceneTools tools;
    private final ProposalStore store;
    private final DrawingMapper drawings;
    private final ZoneId zone;

    public ChatService(AiSettingService settings, AiUsageService usage, ClaudeGateway gateway, SceneTools tools, ProposalStore store,
            DrawingMapper drawings, @Value("${factory3d.time-zone:Asia/Seoul}") String zone) {
        this.settings = settings;
        this.usage = usage;
        this.gateway = gateway;
        this.tools = tools;
        this.store = store;
        this.drawings = drawings;
        this.zone = ZoneId.of(zone);
    }

    public void chat(String user, long drawingId, String message, ChatSink sink) {
        try {
            AiSettingService.Status st = settings.status();
            if (!st.enabled()) {
                sink.error(AiSettingService.reasonText(st.reason()));
                return;
            }
            AiSettingService.Active key = settings.requireKey();
            DrawingDetail d = drawings.findById(drawingId);
            if (d == null) {
                sink.error("도면을 찾을 수 없습니다.");
                return;
            }
            ProposalStore.Conversation c = store.get(user, drawingId, gateway::newTranscript);
            if (c.turns >= ProposalStore.MAX_TURNS && !c.lock.isLocked()) {
                store.reset(user, drawingId);
                c = store.get(user, drawingId, gateway::newTranscript);
                sink.text("(대화가 길어 새 대화로 시작합니다)\n\n");
            }
            if (!c.lock.tryLock()) {
                sink.error("이전 요청을 처리하는 중입니다. 잠시 뒤 다시 보내세요.");
                return;
            }
            try {
                run(user, key, d, c, message, sink);
            } finally {
                c.lock.unlock();
            }
        } catch (AiCallException | BadRequestException e) {
            sink.error(e.getMessage());
        } catch (RuntimeException e) {
            log.error("AI 챗봇 처리 중 오류", e);
            store.reset(user, drawingId); // 끊긴 도구 호출이 남지 않게
            sink.error("AI 챗봇 처리 중 오류가 났습니다.");
        }
    }

    private void run(String user, AiSettingService.Active key, DrawingDetail d, ProposalStore.Conversation c, String message, ChatSink sink) {
        int t0 = c.transcript.messages();
        String head = c.turns == 0 ? "[도면: " + d.name() + " · 지금: " + ZonedDateTime.now(zone).format(WHEN) + "]\n" : "";
        String note = c.takeNote();
        c.transcript.addUserText(head + (note == null ? "" : note + "\n") + message);
        c.turns++;
        Changeset cs = c.changeset;
        Changeset.Snapshot snap = cs.snapshot();
        int v0 = cs.version();
        Call call = new Call(key.apiKey(), key.model(), Prompts.SYSTEM, tools.specs(), Prompts.MAX_TOKENS);
        long in = 0, out = 0, cr = 0, cw = 0;
        BigDecimal cost = BigDecimal.ZERO;
        int calls = 0;
        try {
            while (true) {
                Turn t = gateway.next(call, c.transcript, sink::text);
                var u = t.usage();
                cost = cost.add(usage.record(user, d.id(), u.model(), u.input(), u.output(), u.cacheRead(), u.cacheWrite(), "chat"));
                in += u.input();
                out += u.output();
                cr += u.cacheRead();
                cw += u.cacheWrite();
                if (t.stop() == Stop.REFUSAL) {
                    cs.restore(snap);
                    c.transcript.truncate(t0);
                    c.turns--;
                    sink.error("요청을 처리할 수 없습니다 (사유: " + t.refusal() + ")");
                    return;
                }
                if (t.stop() != Stop.TOOL_USE || t.toolCalls().isEmpty()) {
                    if (t.stop() == Stop.MAX_TOKENS) sink.text("\n\n(답이 길어 중간에 끊겼습니다)");
                    break;
                }
                List<ToolResult> results = new ArrayList<>();
                boolean over = false;
                for (ToolCall tc : t.toolCalls()) {
                    if (++calls > Prompts.MAX_TOOL_CALLS) {
                        results.add(new ToolResult(tc.id(), "{\"error\":\"도구 호출 한도를 넘었습니다\"}", true));
                        over = true;
                        continue;
                    }
                    SceneTools.Result r;
                    try {
                        r = tools.execute(d.id(), cs, tc);
                    } catch (RuntimeException e) {
                        log.warn("도구 {} 실행 오류", tc.name(), e);
                        r = new SceneTools.Result("{\"error\":\"도구 실행 중 오류가 났습니다\"}", true, "확인 필요: 도구 실행 오류");
                    }
                    sink.tool(tc.name(), r.label());
                    results.add(new ToolResult(tc.id(), r.content(), r.isError()));
                }
                c.transcript.addToolResults(results);
                if (over) {
                    sink.text("\n\n작업이 길어 중간에 멈췄습니다.");
                    break;
                }
            }
        } catch (AiCallException e) {
            if (cs.version() != v0) sink.proposal(cs.view()); // 앞 턴에서 만든 제안은 보여 줌
            throw e;
        }
        if (cs.version() != v0) sink.proposal(cs.view());
        sink.done(new Done(in, out, cr, cw, cost));
    }
}
