package com.kopens.factory3d.common;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.Resource;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.resource.PathResourceResolver;

/** 빌드된 화면 서비스. 파일이 없는 주소는 index.html 을 돌려줘 화면 라우터가 처리 (/api 는 제외 → 404 JSON). */
@Configuration
public class SpaConfig implements WebMvcConfigurer {
    /** 화면 빌드 폴더(web/dist)를 jar 대신 바로 서비스 — 프로필 embedded (bootRun). 비우면 jar 안의 static/ 만 */
    private final String webDir;

    public SpaConfig(@Value("${factory3d.web-dir:}") String webDir) {
        this.webDir = webDir;
    }

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        String location = "classpath:/static/";
        if (!webDir.isBlank()) {
            Path dir = Path.of(webDir).toAbsolutePath().normalize();
            if (Files.isRegularFile(dir.resolve("index.html"))) location = dir.toUri().toString();
        }
        registry.addResourceHandler("/**")
                .addResourceLocations(location)
                .resourceChain(true)
                .addResolver(new PathResourceResolver() {
                    @Override
                    protected Resource getResource(String path, Resource location) throws IOException {
                        Resource found = location.createRelative(path);
                        if (found.exists() && found.isReadable()) return found;
                        if (path.equals("api") || path.startsWith("api/") || path.startsWith("v3/")
                                || path.startsWith("swagger-ui")) return null;
                        Resource index = location.createRelative("index.html");
                        return index.exists() ? index : null;
                    }
                });
    }
}
