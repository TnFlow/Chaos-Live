package com.chaoslive.net.protocol;

public class GameActionMessage {
    public String type;
    public Payload payload;

    public static class Payload {
        public String id;
        public String actionType;
        public String command;
        public int priority;
        public long timestamp;
    }
}
