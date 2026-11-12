package com.kopens.factory3d.common;

import java.io.IOException;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.Resource;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.resource.PathResourceResolver;

/** 빌드된 화면 서비스. 파일이 없는 주소는 index.html 을 돌려줘 화면 라우터가 처리 (/api 는 제외 → 404 JSON). */
@Configuration
public class SpaConfig implements WebMvcConfigurer {

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        registry.addResourceHandler("/**")
                .addResourceLocations("classpath:/static/")
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
