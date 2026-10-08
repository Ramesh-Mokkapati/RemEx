package com.remex.RemExService.controllers;

import com.google.common.collect.ImmutableMap;
import io.micrometer.core.annotation.Timed;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDateTime;
import java.util.Map;

import static org.springframework.web.bind.annotation.RequestMethod.GET;

@RestController
public class RootController {

    @Value("RemExService")
    private String appName;

    @Timed
    @RequestMapping(path = {"/"}, method = {GET}, produces = {"application/json"})
    public Map root() {
        return ImmutableMap.builder()
                .put("Application Name", appName)
                .put("Application Version", "1.0")
                .put("Java Version", System.getProperty("java.version"))
                .put("Current Date", LocalDateTime.now())
                .build();
    }
}