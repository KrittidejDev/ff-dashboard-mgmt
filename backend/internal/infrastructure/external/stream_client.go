package external

import (
	"context"
	"fmt"
	"log"
	"time"

	"ff-dashboard-mgmt/backend/internal/config"
	streamv1 "ff-dashboard-mgmt/backend/pkg/proto/stream/v1"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"
)

type StreamClient struct {
	addr   string
	secret string
}

func NewStreamClient(cfg *config.Config) *StreamClient {
	return &StreamClient{
		addr:   cfg.CctvStreamServiceAddr,
		secret: cfg.CctvStreamServiceSecret,
	}
}

func (s *StreamClient) getConn() (*grpc.ClientConn, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	conn, err := grpc.DialContext(ctx, s.addr,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithBlock(),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to dial cctv-stream-service at %s: %w", s.addr, err)
	}
	return conn, nil
}

func (s *StreamClient) wrapContext(ctx context.Context) context.Context {
	// Add metadata secret header for auth check in microservice
	md := metadata.New(map[string]string{
		"X-Gateway-Meta-CCTV-Stream-Secret": s.secret,
	})
	return metadata.NewOutgoingContext(ctx, md)
}

func (s *StreamClient) InitializeStream(ctx context.Context, deviceID, sourceURL string) (*streamv1.StreamResponse, error) {
	conn, err := s.getConn()
	if err != nil {
		return nil, err
	}
	defer conn.Close()

	client := streamv1.NewStreamManagerClient(conn)
	grpcCtx := s.wrapContext(ctx)

	log.Printf("[StreamClient] Initializing stream on cctv-stream-service. DeviceID: %s, SourceURL: %s", deviceID, sourceURL)
	resp, err := client.InitializeStream(grpcCtx, &streamv1.StreamRequest{
		DeviceId:  deviceID,
		SourceUrl: sourceURL,
	})
	if err != nil {
		return nil, fmt.Errorf("grpc InitializeStream error: %w", err)
	}

	return resp, nil
}

func (s *StreamClient) TerminateStream(ctx context.Context, deviceID string) error {
	conn, err := s.getConn()
	if err != nil {
		return err
	}
	defer conn.Close()

	client := streamv1.NewStreamManagerClient(conn)
	grpcCtx := s.wrapContext(ctx)

	log.Printf("[StreamClient] Terminating stream on cctv-stream-service. DeviceID: %s", deviceID)
	_, err = client.TerminateStream(grpcCtx, &streamv1.TerminateRequest{
		DeviceId: deviceID,
	})
	if err != nil {
		return fmt.Errorf("grpc TerminateStream error: %w", err)
	}

	return nil
}
