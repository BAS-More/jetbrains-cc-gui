package com.github.claudecodegui.provider.openclaude;

import com.google.gson.JsonObject;

import com.github.claudecodegui.session.ClaudeSession;
import com.github.claudecodegui.provider.common.BaseSDKBridge;
import com.github.claudecodegui.provider.common.MessageCallback;
import com.github.claudecodegui.provider.common.SDKResult;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;

/**
 * OpenClaude SDK bridge.
 * Spawns the OpenClaude CLI (occ) via the ai-bridge openclaude channel.
 * Routes LLM traffic through 9Router when OPENAI_API_BASE is configured.
 *
 * Uses the same tagged-line protocol as Codex ([MESSAGE_START], [CONTENT_DELTA],
 * [SESSION_ID], [MESSAGE], [SEND_ERROR], [MESSAGE_END], [THINKING]).
 */
public class OpenClaudeSDKBridge extends BaseSDKBridge {

    public OpenClaudeSDKBridge() {
        super(OpenClaudeSDKBridge.class);
    }

    @Override
    protected String getProviderName() {
        return "openclaude";
    }

    @Override
    protected void configureProviderEnv(Map<String, String> env, String stdinJson) {
        env.put("OPENCLAUDE_USE_STDIN", "true");

        // Route through 9Router when configured
        String routerBase = System.getenv("OPENAI_API_BASE");
        if (routerBase != null && !routerBase.isEmpty()) {
            env.put("OPENAI_API_BASE", routerBase);
        }

        // Allow custom OCC binary path
        String occPath = System.getenv("OCC_PATH");
        if (occPath != null && !occPath.isEmpty()) {
            env.put("OCC_PATH", occPath);
        }

        // Custom agents definition file
        String agentsPath = System.getenv("OCC_AGENTS_PATH");
        if (agentsPath != null && !agentsPath.isEmpty()) {
            env.put("OCC_AGENTS_PATH", agentsPath);
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
        // Reuse the same tagged-line protocol as Codex
        if (line.contains("[DEBUG]") || line.startsWith("[openclaude]")) {
            LOG.debug("[OpenClaude] " + line);
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

                    if ("assistant".equals(msgType)) {
                        try {
                            String extracted = extractAssistantText(msg);
                            if (extracted != null && !extracted.isEmpty()) {
                                assistantContent.append(extracted);
                            }
                        } catch (Exception ignored) {
                        }
                    }

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
     * Extract assistant text from a message JSON object.
     */
    private String extractAssistantText(JsonObject msg) {
        if (msg.has("content") && msg.get("content").isJsonArray()) {
            StringBuilder sb = new StringBuilder();
            for (var el : msg.getAsJsonArray("content")) {
                if (el.isJsonObject()) {
                    JsonObject block = el.getAsJsonObject();
                    if (block.has("text") && !block.get("text").isJsonNull()) {
                        sb.append(block.get("text").getAsString());
                    }
                }
            }
            return sb.toString();
        }
        if (msg.has("text") && !msg.get("text").isJsonNull()) {
            return msg.get("text").getAsString();
        }
        return null;
    }

    /**
     * Send message to OpenClaude (streaming response).
     */
    public CompletableFuture<SDKResult> sendMessage(
            String channelId,
            String message,
            String sessionId,
            String cwd,
            String model,
            String agentName,
            MessageCallback callback
    ) {
        JsonObject stdinObj = new JsonObject();
        stdinObj.addProperty("message", message);
        stdinObj.addProperty("sessionId", sessionId != null ? sessionId : "");
        stdinObj.addProperty("cwd", cwd != null ? cwd : "");
        stdinObj.addProperty("channelId", channelId);
        if (model != null && !model.isEmpty()) {
            stdinObj.addProperty("model", model);
        }
        if (agentName != null && !agentName.isEmpty()) {
            stdinObj.addProperty("agentName", agentName);
        }

        String stdinJson = gson.toJson(stdinObj);
        return executeStreamingCommand(channelId, "send", stdinJson, callback);
    }

    /**
     * Get session messages — not supported for OpenClaude.
     */
    public List<JsonObject> getSessionMessages(String sessionId, String cwd) {
        return Collections.emptyList();
    }
}
