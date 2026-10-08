package com.remex.common.models;

/**
 * Plain data holder for an audit-log event (host, session, user, details).
 * Not persisted anywhere — used for structured logging only.
 */
public class EventLog {

    private String eventDetails;

    private String host;

    private String sessionId;

    private String username;

    public EventLog(String host, String sessionId, String username, String eventDetails) {
        this.host = host;
        this.sessionId = sessionId;
        this.username = username;
        this.eventDetails = eventDetails;
    }

    public EventLog() {
    }

    public String getEventDetails() {
        return this.eventDetails;
    }

    public void setEventDetails(String eventDetails) {
        this.eventDetails = eventDetails;
    }

    public String getHost() {
        return this.host;
    }

    public void setHost(String host) {
        this.host = host;
    }

    public String getSessionId() {
        return this.sessionId;
    }

    public void setSessionId(String sessionId) {
        this.sessionId = sessionId;
    }

    public String getUsername() {
        return this.username;
    }

    public void setUsername(String username) {
        this.username = username;
    }
}
