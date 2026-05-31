package com.codemapper.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.lang.NonNull;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class CorsConfig implements WebMvcConfigurer {

    /**
     * Orígenes permitidos. Por defecto cualquier puerto de localhost (el dev
     * server de Next cae a 3001/3002… si 3000 está ocupado). En producción /
     * multiusuario se setea el dominio real vía
     * {@code CODEMAPPER_CORS_ALLOWED_ORIGIN_PATTERNS} (o la property
     * {@code codemapper.cors.allowed-origin-patterns}), separado por comas.
     * NO usar "*" con allowCredentials(true).
     */
    @Value("${codemapper.cors.allowed-origin-patterns:http://localhost:[*],http://127.0.0.1:[*]}")
    private String[] allowedOriginPatterns;

    @Override
    public void addCorsMappings(@NonNull CorsRegistry registry) {
        registry.addMapping("/**")
                .allowedOriginPatterns(allowedOriginPatterns)
                .allowedMethods("GET", "POST", "DELETE", "OPTIONS")
                .allowedHeaders("*")
                .allowCredentials(true)
                .maxAge(3600);
    }
}
