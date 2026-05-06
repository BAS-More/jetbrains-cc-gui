package com.github.claudecodegui.provider.crewai;

import com.google.gson.JsonObject;

import com.github.claudecodegui.provider.common.BaseSDKBridge;
import com.github.claudecodegui.provider.common.MessageCallback;
import com.github.claudecodegui.provider.common.SDKResult;

import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;

/**
 * CrewAI SDK bridge.
 * Communicates with the CrewAI FastAPI bridge via the ai-bridge crewai channel.
 * Supports crew listing, agent listing, and streaming crew runs via SSE.
 *
 * Uses the same tagged-line protocol as other providers.
 */
public class CrewAISDKBridge extends BaseSDKBridge {

    public CrewAISDKBridge() {
        super(CrewAISDKBridge.class);
    }

    @Override
    protected String getProviderName() {
        return "crewai";
    }

    @Override
    protected void configureProviderEnv(Map<String, String> env, String stdinJson) {
        env.put("CREWAI_USE_STDIN", "true");

        // Allow custom bridge URL
        String bridgeUrl = System.getenv("CREWAI_BRIDGE_URL");
        if (bridgeUrl != null && !bridgeUrl.isEmpty()) {
            env.put("CREWAI_BRIDGE_URL", bridgeUrl);
        }
    }

    @Override
    protected void processOutputLine(
            String line,
            MessageCallback callback,
            SDKResult result,
            StringBuilder assistantContent,
            boolean[] hadSendError,
            String[] lastNodeError
    ) {
        if (line.contains("[DEBUG]") || line.startsWith("[crewai]")) {
            LOG.debug("[CrewAI] " + line);
            return;
        }

        if (line.startsWith("[MESSAGE_START]")) {
            callback.onMessage("message_start", "");
        } else if (line.startsWith("[MESSAGE_END]")) {
            callback.onMessage("message_end", "");
        } else if (line.startsWith("[SESSION_ID]")) {
            String sessionId = line.substring("[SESSION_ID]".length()).trim();
            callback.onMessage("session_id", sessionId);
        } else if (line.startsWith("[MESSAGE]")) {
            String jsonStr = line.substring("[MESSAGE]".length()).trim();
            try {
                JsonObject msg = gson.fromJson(jsonStr, JsonObject.class);
                if (msg != null) {
                    String msgType = msg.has("type") && !msg.get("type").isJsonNull()
                            ? msg.get("type").getAsString()
                            : "unknown";
                    result.messages.add(msg);
                    callback.onMessage(msgType, jsonStr);
                }
            } catch (Exception ignored) {
            }
        } else if (line.startsWith("[CONTENT_DELTA]")) {
            String delta = line.substring("[CONTENT_DELTA]".length());
            assistantContent.append(delta);
            callback.onMessage("content_delta", delta);
        } else if (line.startsWith("[THINKING]")) {
            String thinking = line.substring("[THINKING]".length());
            callback.onMessage("thinking", thinking);
        } else if (line.startsWith("[SEND_ERROR]")) {
            String jsonStr = line.substring("[SEND_ERROR]".length()).trim();
            String errorMessage = jsonStr;
            try {
                JsonObject obj = gson.fromJson(jsonStr, JsonObject.class);
                if (obj.has("error")) {
                    errorMessage = obj.get("error").getAsString();
                }
            } catch (Exception ignored) {
            }
            hadSendError[0] = true;
            result.success = false;
            result.error = errorMessage;
            callback.onError(errorMessage);
        }
    }

    /**
     * Run a crew with streaming output.
     */
    public CompletableFuture<SDKResult> sendMessage(
            String channelId,
            String message,
            String crewId,
            String sessionId,
            MessageCallback callback
    ) {
        JsonObject stdinObj = new JsonObject();
        stdinObj.addProperty("message", message != null ? message : "");
        stdinObj.addProperty("crewId", crewId != null ? crewId : "");
        stdinObj.addProperty("sessionId", sessionId != null ? sessionId : "");
        stdinObj.addProperty("channelId", channelId);

        String stdinJson = gson.toJson(stdinObj);
        return executeStreamingCommand(channelId, "send", stdinJson, callback);
    }

    /**
     * List available crews (non-streaming).
     */
    public CompletableFuture<SDKResult> listCrews(String channelId, MessageCallback callback) {
        return executeStreamingCommand(channelId, "listCrews", "{}", callback);
    }

    /**
     * List available agents (non-streaming).
     */
    public CompletableFuture<SDKResult> listAgents(String channelId, MessageCallback callback) {
        return executeStreamingCommand(channelId, "listAgents", "{}", callback);
    }

    /**
     * Check CrewAI bridge health (non-streaming).
     */
    public CompletableFuture<SDKResult> healthCheck(String channelId, MessageCallback callback) {
        return executeStreamingCommand(channelId, "healthCheck", "{}", callback);
    }

    /**
     * Get session messages — not supported for CrewAI.
     */
    public List<JsonObject> getSessionMessages(String sessionId, String cwd) {
        return Collections.emptyList();
    }
}
