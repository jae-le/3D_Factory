package com.kopens.factory3d.live;

import java.util.List;
import java.util.Map;

/** WebSocket 으로 보내는 JSON (화면 web/src/dashboard/types.ts 와 같은 모양). actual·target 은 소수 1자리 */
public final class LiveMessages {
    private LiveMessages() {}

    public record Kpi(int running, int ok, int warn, int bad, int doneToday, int planRate, String at) {}

    public record StationLive(long id, int no, String name, String placementName, List<String> steps, int step, double actual,
            double target, String status, Long projectId, Integer unitNo) {}

    public record ProjectLive(long id, String name, int done, int total, String period, String state) {}

    public record LiveEvent(long id, String at, String kind, String station, String text, Map<String, Object> data) {}

    public record Snapshot(String type, long drawingId, Kpi kpi, List<StationLive> stations, List<ProjectLive> projects,
            List<LiveEvent> events, List<LiveEvent> materials) {}

    public record Tick(String type, Kpi kpi, List<StationLive> stations) {}

    public record EventMessage(String type, LiveEvent event) {}

    public record Projects(String type, List<ProjectLive> projects) {}

    /** 보내지 않는 내부 신호: 도면이 지워짐 → 받는 쪽(LiveOutbox)은 4404 로 연결을 닫음 */
    public record Gone(long drawingId) {}
}
