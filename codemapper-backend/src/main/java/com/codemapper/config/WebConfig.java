package com.codemapper.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@Configuration
public class WebConfig {

    @Bean(destroyMethod = "shutdown")
    public ExecutorService analysisExecutor() {
        return Executors.newCachedThreadPool(r -> {
            Thread t = new Thread(r, "codemapper-analysis");
            t.setDaemon(true);
            return t;
        });
    }
}
