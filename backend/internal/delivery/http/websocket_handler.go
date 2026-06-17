package http

import (
	"context"
	"encoding/json"

	"github.com/gofiber/contrib/v3/websocket"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
)

type WebSocketHandler struct {
	redis  *redis.Client
	logger *zap.Logger
}

func NewWebSocketHandler(rdb *redis.Client, logger *zap.Logger) *WebSocketHandler {
	return &WebSocketHandler{
		redis:  rdb,
		logger: logger,
	}
}

// RawTelemetry handles the real-time websocket updates for admins.
// It subscribes to Redis Pub/Sub channel "device:updates:raw" and pushes events dynamically.
func (h *WebSocketHandler) RawTelemetry(c *websocket.Conn) {
	h.logger.Info("admin websocket client connected", zap.String("remote_addr", c.RemoteAddr().String()))
	defer func() {
		_ = c.Close()
		h.logger.Info("admin websocket client disconnected", zap.String("remote_addr", c.RemoteAddr().String()))
	}()

	if h.redis == nil {
		_ = c.WriteJSON(map[string]string{"error": "redis client is uninitialized"})
		return
	}

	pubsub := h.redis.Subscribe(context.Background(), "device:updates:raw")
	defer pubsub.Close()

	ch := pubsub.Channel()

	if err := c.WriteJSON(map[string]string{"event": "connected"}); err != nil {
		return
	}

	closeCh := make(chan struct{})
	go func() {
		for {
			_, _, err := c.ReadMessage()
			if err != nil {
				close(closeCh)
				return
			}
		}
	}()

	for {
		select {
		case msg, ok := <-ch:
			if !ok {
				return
			}
			
			var rawTelem map[string]any
			if err := json.Unmarshal([]byte(msg.Payload), &rawTelem); err == nil {
				if err := c.WriteJSON(rawTelem); err != nil {
					h.logger.Error("websocket: failed to write message to client", zap.Error(err))
					return
				}
			}
		case <-closeCh:
			return
		}
	}
}
