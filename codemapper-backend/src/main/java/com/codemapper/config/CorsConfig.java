package com.codemapper.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.lang.NonNull;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class CorsConfig implements WebMvcConfigurer {

    @Override
    public void addCorsMappings(@NonNull CorsRegistry registry) {
        // Dev: the Next.js dev server falls back to 3001/3002/… when 3000 is
        // taken, so allow any localhost port rather than pinning to 3000.
        // allowedOriginPatterns (not allowedOrigins) is required to combine a
        // wildcard with allowCredentials(true). The "Escuchando" SSE stream
        // (/api/trace/stream) is browser-origin, so it needs this too.
        registry.addMapping("/**")
                .allowedOriginPatterns("http://localhost:[*]", "http://127.0.0.1:[*]")
                .allowedMethods("GET", "POST", "DELETE", "OPTIONS")
                .allowedHeaders("*")
                .allowCredentials(true)
                .maxAge(3600);
    }
}
