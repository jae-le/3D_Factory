package com.kopens.factory3d.drawing;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

/** 첫 실행 기본 도면: 도면이 하나도 없으면 demo 의 나셀 공장 배치(main_factory.dxf)를 넣음 */
@Component
public class DrawingSeeder implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(DrawingSeeder.class);
    private final DrawingMapper drawings;
    private final DrawingService service;

    public DrawingSeeder(DrawingMapper drawings, DrawingService service) {
        this.drawings = drawings;
        this.service = service;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            seedIfEmpty();
        } catch (Exception e) {
            log.warn("기본 도면을 넣지 못했습니다: {}", e.getMessage());
        }
    }

    public boolean seedIfEmpty() throws IOException {
        if (drawings.count() > 0) return false;
        byte[] dxf = read("seed/main_factory.dxf");
        String plan = new String(read("seed/main_factory.plan.json"), StandardCharsets.UTF_8);
        service.createSeed("나셀 공장", dxf, plan);
        log.info("기본 도면 '나셀 공장' 을 넣었습니다");
        return true;
    }

    private static byte[] read(String path) throws IOException {
        try (InputStream in = new ClassPathResource(path).getInputStream()) {
            return in.readAllBytes();
        }
    }
}
