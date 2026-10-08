package com.remex.RemExService;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication(scanBasePackages = "com.remex")
public class RemExService {
    public static void main(String[] args) {
        SpringApplication.run(RemExService.class, args);
    }
}