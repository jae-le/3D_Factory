package com.kopens.factory3d.ai;

import java.util.List;

/** 게이트웨이가 가진 대화 기록 (불투명). 서버 메모리에만 있음 */
public interface Transcript {
    void addUserText(String text);

    /** 글 + 이미지. 이미지를 모르는 기록(가짜)은 글만 */
    default void addUser(String text, List<ClaudeGateway.Image> images) {
        addUserText(text);
    }

    /** 한 응답의 도구 호출 결과를 모두 한 사용자 메시지로 */
    void addToolResults(List<ClaudeGateway.ToolResult> results);

    int messages();

    /** 앞의 n 개 메시지만 남기고 뒤는 버림 */
    void truncate(int messages);
}
