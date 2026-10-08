package com.remex.common.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cloud.context.restart.RestartEndpoint;
import org.springframework.stereotype.Service;

@Service
public class RestartService {

    @Autowired(required = false)
    private RestartEndpoint restartEndpoint;

    public void restartApp() {
        if (restartEndpoint != null) {
            restartEndpoint.restart();
        }
    }
}
