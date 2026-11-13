package com.kopens.factory3d.live;

/** 한 도면의 실시간 메시지를 받는 쪽 (WebSocket 세션 하나). message 는 LiveMessages 의 record */
@FunctionalInterface
public interface LiveListener {
    void onMessage(Object message);
}
