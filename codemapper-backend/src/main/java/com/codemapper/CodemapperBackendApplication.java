package com.codemapper;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class CodemapperBackendApplication {

    public static void main(String[] args) {
        SpringApplication.run(CodemapperBackendApplication.class, args);
    }
}
