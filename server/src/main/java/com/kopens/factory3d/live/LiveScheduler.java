package com.kopens.factory3d.live;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** 1초마다 가상 MES 진행 (factory3d.live.enabled=false 면 없음 — 테스트) */
@Component
@ConditionalOnProperty(name = "factory3d.live.enabled", havingValue = "true", matchIfMissing = true)
public class LiveScheduler {
    private static final Logger log = LoggerFactory.getLogger(LiveScheduler.class);
    private final VirtualMes mes;

    public LiveScheduler(VirtualMes mes) {
        this.mes = mes;
    }

    @Scheduled(fixedRate = 1000)
    public void run() {
        try {
            mes.tick();
        } catch (RuntimeException e) {
            log.warn("상황판 진행 실패: {}", e.getMessage());
        }
    }
}
