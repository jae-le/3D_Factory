package com.kopens.factory3d.live;

/** 생산 데이터 원천. 첫 구현 = VirtualMes(가상 MES). 나중에 실제 MES 연동도 이 인터페이스로 */
public interface ProductionSource {
    /** 지금 상태 전체. 공정이 없는 도면은 빈 목록 */
    LiveMessages.Snapshot snapshot(long drawingId);

    void subscribe(long drawingId, LiveListener listener);

    /** 구독하고 그 시점의 snapshot 을 돌려줌. 둘 사이에 전달되는 메시지가 없게 한 번에 (WebSocket 은 이걸로 붙음) */
    LiveMessages.Snapshot subscribeWithSnapshot(long drawingId, LiveListener listener);

    void unsubscribe(long drawingId, LiveListener listener);

    /** 기준정보를 다시 읽어 처음부터 진행하고 구독자에게 새 snapshot */
    void reload(long drawingId);
}
