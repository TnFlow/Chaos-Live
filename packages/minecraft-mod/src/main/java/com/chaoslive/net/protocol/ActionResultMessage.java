package com.chaoslive.net.protocol;

public class ActionResultMessage {
    public String type = "ACTION_RESULT";
    public String correlationId;
    public boolean success;
    public long durationMs;
    public String response;
    public String error;

    public ActionResultMessage(String correlationId, boolean success, long durationMs, String response, String error) {
        this.correlationId = correlationId;
        this.success = success;
        this.durationMs = durationMs;
        this.response = response;
        this.error = error;
    }
}
