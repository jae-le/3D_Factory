package com.kopens.factory3d.live;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

/** raw WebSocket (JSON 글). 같은 출처는 항상 허용, 그 밖에는 factory3d.live.allowed-origins 만 */
@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {
    private final LiveSocketHandler handler;
    private final String[] origins;

    public WebSocketConfig(LiveSocketHandler handler, @Value("${factory3d.live.allowed-origins:http://localhost:5200}") String[] origins) {
        this.handler = handler;
        this.origins = origins;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(handler, "/ws/live").setAllowedOrigins(origins);
    }
}
