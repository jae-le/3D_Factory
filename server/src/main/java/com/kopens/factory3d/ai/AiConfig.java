package com.kopens.factory3d.ai;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** factory3d.ai.fake=true 면 가짜 게이트웨이 (실제 Claude 를 부르지 않음) */
@Configuration
public class AiConfig {
    private static final Logger log = LoggerFactory.getLogger(AiConfig.class);

    @Bean
    ClaudeGateway claudeGateway(@Value("${factory3d.ai.fake:false}") boolean fake) {
        if (fake) {
            log.warn("AI 챗봇이 가짜 게이트웨이로 동작합니다 (F3D_AI_FAKE=true) — 정해 둔 대본으로만 답합니다");
            return new FakeGateway();
        }
        return new AnthropicGateway();
    }

    /** 챗봇 SSE 응답을 만드는 일꾼 (가상 스레드 — 요청마다 하나) */
    @Bean(destroyMethod = "close")
    ExecutorService aiExecutor() {
        return Executors.newVirtualThreadPerTaskExecutor();
    }
}
