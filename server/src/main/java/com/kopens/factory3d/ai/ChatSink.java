package com.kopens.factory3d.ai;

/** 챗봇 응답을 받는 쪽 (SSE · 테스트 기록) */
public interface ChatSink {
    void text(String chunk);

    void tool(String name, String label);

    void proposal(Changeset.View proposal);

    void done(ChatService.Done done);

    void error(String message);

    /** 받는 쪽이 떠났으면 true (Claude 호출을 더 하지 않음) */
    default boolean closed() {
        return false;
    }
}
