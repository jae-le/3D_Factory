package com.kopens.factory3d.ai;

import java.util.List;

/** 게이트웨이가 가진 대화 기록 (불투명). 서버 메모리에만 있음 */
public interface Transcript {
    void addUserText(String text);

    /** 한 응답의 도구 호출 결과를 모두 한 사용자 메시지로 */
    void addToolResults(List<ClaudeGateway.ToolResult> results);

    int messages();
}
