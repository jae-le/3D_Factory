package com.kopens.factory3d.common;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** 업로드 파일 폴더. 시작할 때 절대경로로 바꿔 한 번 알리고, 없으면 만들고, 쓸 수 없으면 시작 실패 */
@Component
public class DataDir {
    private static final Logger log = LoggerFactory.getLogger(DataDir.class);
    private final Path root;

    public DataDir(@Value("${factory3d.data-dir:../data}") String configured) {
        Path p = Path.of(configured).toAbsolutePath().normalize();
        try {
            Files.createDirectories(p);
        } catch (IOException e) {
            throw new IllegalStateException("데이터 폴더를 만들 수 없습니다: " + p, e);
        }
        if (!Files.isDirectory(p) || !Files.isWritable(p))
            throw new IllegalStateException("데이터 폴더에 쓸 수 없습니다: " + p);
        this.root = p;
        log.info("데이터 폴더: {}", p);
    }

    public Path root() {
        return root;
    }

    /** 폴더 기준 상대 경로 → 절대 경로 (폴더 밖은 거부) */
    public Path resolve(String relative) {
        Path p = root.resolve(relative).normalize();
        if (!p.startsWith(root)) throw new IllegalArgumentException("데이터 폴더 밖 경로: " + relative);
        return p;
    }
}
