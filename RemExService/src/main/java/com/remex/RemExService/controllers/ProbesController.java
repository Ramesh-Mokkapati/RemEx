package com.remex.RemExService.controllers;

import com.remex.common.service.RestartService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/probe")
public class ProbesController {

    @Autowired
    private RestartService restartService;

    @GetMapping(path = "/live", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<String> live() {
        return new ResponseEntity<String>("RMX-RSMS-Service is alive!", HttpStatus.OK);
    }

    @GetMapping(path = "/ready", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<String> ready() {
        return new ResponseEntity<String>("RMX-RSMS-Service is ready!", HttpStatus.OK);
    }

    @PostMapping("/restart")
    public void restartUsingActuator() {
        restartService.restartApp();
    }
}
