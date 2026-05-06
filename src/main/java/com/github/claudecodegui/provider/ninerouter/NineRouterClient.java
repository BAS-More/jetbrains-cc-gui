package com.github.claudecodegui.provider.ninerouter;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.intellij.openapi.diagnostic.Logger;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

/**
 * Pure Java HTTP client for 9Router (localhost:20128).
 * Provides health checks, account listing, and usage statistics.
 *
 * Does NOT extend BaseSDKBridge — 9Router is not an AI provider,
 * it's the infrastructure proxy that all providers route through.
 */
public class NineRouterClient {

    private static final Logger LOG = Logger.getInstance(NineRouterClient.class);
    private static final int DEFAULT_PORT = 20128;
    private static final Duration TIMEOUT = Duration.ofSeconds(3);
    private final Gson gson = new Gson();
    private final HttpClient httpClient;
    private final int port;

    public NineRouterClient() {
        this(DEFAULT_PORT);
    }

    public NineRouterClient(int port) {
        this.port = port;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(TIMEOUT)
                .build();
    }

    private String baseUrl() {
        return "http://localhost:" + port;
    }

    /**
     * Check if 9Router is reachable.
     */
    public boolean checkHealth() {
        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(baseUrl() + "/api/init"))
                    .timeout(TIMEOUT)
                    .GET()
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            return response.statusCode() >= 200 && response.statusCode() < 300;
        } catch (Exception e) {
            LOG.debug("9Router health check failed: " + e.getMessage());
            return false;
        }
    }

    /**
     * Get connected accounts from 9Router.
     */
    public List<JsonObject> getAccounts() {
        List<JsonObject> accounts = new ArrayList<>();
        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(baseUrl() + "/api/connections"))
                    .timeout(Duration.ofSeconds(5))
                    .GET()
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() == 200) {
                JsonObject body = gson.fromJson(response.body(), JsonObject.class);
                JsonArray connections = body.has("connections") ? body.getAsJsonArray("connections") : new JsonArray();
                for (JsonElement el : connections) {
                    if (el.isJsonObject()) {
                        JsonObject conn = el.getAsJsonObject();
                        JsonObject account = new JsonObject();
                        account.addProperty("id", conn.has("id") ? conn.get("id").getAsString() : "");
                        account.addProperty("name", conn.has("name") ? conn.get("name").getAsString() : "");
                        account.addProperty("provider", conn.has("provider") ? conn.get("provider").getAsString() : "");
                        account.addProperty("status", conn.has("status") ? conn.get("status").getAsString() : "");
                        accounts.add(account);
                    }
                }
            }
        } catch (Exception e) {
            LOG.debug("9Router getAccounts failed: " + e.getMessage());
        }
        return accounts;
    }

    /**
     * Get usage statistics from 9Router.
     */
    public JsonObject getUsage() {
        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(baseUrl() + "/api/usage"))
                    .timeout(Duration.ofSeconds(5))
                    .GET()
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() == 200) {
                return gson.fromJson(response.body(), JsonObject.class);
            }
        } catch (Exception e) {
            LOG.debug("9Router getUsage failed: " + e.getMessage());
        }
        return new JsonObject();
    }

    /**
     * Get full status (health + accounts + usage) in one call.
     */
    public JsonObject getFullStatus() {
        JsonObject status = new JsonObject();
        status.addProperty("reachable", checkHealth());
        status.addProperty("port", port);

        JsonArray accountsArray = new JsonArray();
        for (JsonObject acct : getAccounts()) {
            accountsArray.add(acct);
        }
        status.add("accounts", accountsArray);
        status.add("usage", getUsage());

        return status;
    }
}
