package com.remex.RemExService.models;

public class LogMessage {

    private String eventDate;

    private String eventTime;

    private String eventModule;

    private String eventID;

    private String eventType;

    private String eventLog;

    public String getEventDate() {
        return eventDate;
    }

    public void setEventDate(String eventDate) {
        this.eventDate = eventDate;
    }

    public String getEventTime() {
        return eventTime;
    }

    public void setEventTime(String eventTime) {
        this.eventTime = eventTime;
    }

    public String getEventModule() {
        return eventModule;
    }

    public void setEventModule(String eventModule) {
        this.eventModule = eventModule;
    }

    public String getEventID() {
        return eventID;
    }

    public void setEventID(String eventID) {
        this.eventID = eventID;
    }

    public String getEventType() {
        return eventType;
    }

    public void setEventType(String eventType) {
        this.eventType = eventType;
    }

    public String getEventLog() {
        return eventLog;
    }

    public void setEventLog(String eventLog) {
        this.eventLog = eventLog;
    }
}
