package com.github.claudecodegui.session;

import com.github.claudecodegui.provider.claude.ClaudeSDKBridge;
import com.github.claudecodegui.provider.codex.CodexSDKBridge;
import com.github.claudecodegui.provider.openclaude.OpenClaudeSDKBridge;
import com.github.claudecodegui.provider.crewai.CrewAISDKBridge;
import com.google.gson.JsonObject;

import java.util.List;

/**
 * Centralizes provider-specific bridge routing for session operations.
 */
public class SessionProviderRouter {

    private final ClaudeSDKBridge claudeSDKBridge;
    private final CodexSDKBridge codexSDKBridge;
    private final OpenClaudeSDKBridge openClaudeSDKBridge; // nullable
    private final CrewAISDKBridge crewAISDKBridge; // nullable

    public SessionProviderRouter(ClaudeSDKBridge claudeSDKBridge, CodexSDKBridge codexSDKBridge,
                                 OpenClaudeSDKBridge openClaudeSDKBridge, CrewAISDKBridge crewAISDKBridge) {
        this.claudeSDKBridge = claudeSDKBridge;
        this.codexSDKBridge = codexSDKBridge;
        this.openClaudeSDKBridge = openClaudeSDKBridge;
        this.crewAISDKBridge = crewAISDKBridge;
    }

    public JsonObject launchChannel(String provider, String channelId, String sessionId, String cwd) {
        if ("codex".equals(provider)) {
            return codexSDKBridge.launchChannel(channelId, sessionId, cwd);
        }
        if ("openclaude".equals(provider) && openClaudeSDKBridge != null) {
            return openClaudeSDKBridge.launchChannel(channelId, sessionId, cwd);
        }
        if ("crewai".equals(provider) && crewAISDKBridge != null) {
            return crewAISDKBridge.launchChannel(channelId, sessionId, cwd);
        }
        return claudeSDKBridge.launchChannel(channelId, sessionId, cwd);
    }

    public void interruptChannel(String provider, String channelId) {
        if ("codex".equals(provider)) {
            codexSDKBridge.interruptChannel(channelId);
            return;
        }
        if ("openclaude".equals(provider) && openClaudeSDKBridge != null) {
            openClaudeSDKBridge.interruptChannel(channelId);
            return;
        }
        if ("crewai".equals(provider) && crewAISDKBridge != null) {
            crewAISDKBridge.interruptChannel(channelId);
            return;
        }
        claudeSDKBridge.interruptChannel(channelId);
    }

    public List<JsonObject> getSessionMessages(String provider, String sessionId, String cwd) {
        if ("codex".equals(provider)) {
            return codexSDKBridge.getSessionMessages(sessionId, cwd);
        }
        if ("openclaude".equals(provider) && openClaudeSDKBridge != null) {
            return openClaudeSDKBridge.getSessionMessages(sessionId, cwd);
        }
        if ("crewai".equals(provider) && crewAISDKBridge != null) {
            return crewAISDKBridge.getSessionMessages(sessionId, cwd);
        }
        return claudeSDKBridge.getSessionMessages(sessionId, cwd);
    }
}
