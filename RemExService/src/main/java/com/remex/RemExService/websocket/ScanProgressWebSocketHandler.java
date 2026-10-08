package com.remex.RemExService.websocket;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.net.URI;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class ScanProgressWebSocketHandler extends TextWebSocketHandler {

    private static final Logger logger = LoggerFactory.getLogger(ScanProgressWebSocketHandler.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final ConcurrentHashMap<String, WebSocketSession> sessions = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, List<String>> pending = new ConcurrentHashMap<>();

    @Override
    public synchronized void afterConnectionEstablished(WebSocketSession session) {
        String jobId = extractJobId(session);
        if (jobId == null) return;
        sessions.put(jobId, session);
        List<String> queued = pending.remove(jobId);
        if (queued != null) {
            for (String msg : queued) {
                trySend(session, msg);
            }
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        String jobId = extractJobId(session);
        if (jobId != null) sessions.remove(jobId, session);
    }

    public void sendProgress(String jobId, String category, int current, int total) {
        Map<String, Object> msg = new LinkedHashMap<>();
        msg.put("type", "progress");
        msg.put("category", category);
        msg.put("current", current);
        msg.put("total", total);
        deliver(jobId, msg);
    }

    public void sendComplete(String jobId, int issueCount) {
        Map<String, Object> msg = new LinkedHashMap<>();
        msg.put("type", "complete");
        msg.put("issueCount", issueCount);
        deliver(jobId, msg);
        closeJobSession(jobId);
    }

    public void sendError(String jobId, String error) {
        Map<String, Object> msg = new LinkedHashMap<>();
        msg.put("type", "error");
        msg.put("message", error);
        deliver(jobId, msg);
        closeJobSession(jobId);
    }

    public void cleanupJob(String jobId) {
        pending.remove(jobId);
        closeJobSession(jobId);
    }

    @Scheduled(fixedDelay = 15000)
    public void heartbeat() {
        if (sessions.isEmpty()) return;
        String ping = "{\"type\":\"heartbeat\"}";
        for (Map.Entry<String, WebSocketSession> entry : sessions.entrySet()) {
            WebSocketSession session = entry.getValue();
            if (session.isOpen()) {
                trySend(session, ping);
            }
        }
    }

    private synchronized void deliver(String jobId, Object payload) {
        String json;
        try {
            json = MAPPER.writeValueAsString(payload);
        } catch (Exception e) {
            return;
        }
        WebSocketSession session = sessions.get(jobId);
        if (session != null && session.isOpen()) {
            trySend(session, json);
        } else {
            pending.computeIfAbsent(jobId, k -> new ArrayList<String>()).add(json);
        }
    }

    private void trySend(WebSocketSession session, String json) {
        try {
            session.sendMessage(new TextMessage(json));
        } catch (IOException e) {
            logger.warn("WebSocket send failed: {}", e.getMessage());
        }
    }

    private void closeJobSession(String jobId) {
        WebSocketSession session = sessions.remove(jobId);
        if (session != null && session.isOpen()) {
            try { session.close(); } catch (IOException e) { /* ignore */ }
        }
    }

    private String extractJobId(WebSocketSession session) {
        URI uri = session.getUri();
        if (uri == null) return null;
        String path = uri.getPath();
        int idx = path.lastIndexOf('/');
        return (idx >= 0 && idx < path.length() - 1) ? path.substring(idx + 1) : null;
    }
}
