# Build stage
FROM golang:1.25.5-alpine AS builder

WORKDIR /app

# Copy dependency files
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build high-performance statically linked binary
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -ldflags="-w -s" -o main ./cmd/server/main.go

# Production stage
FROM alpine:latest

RUN apk --no-cache add ca-certificates tzdata curl

WORKDIR /app

# Copy binary from builder stage
COPY --from=builder /app/main .

# Expose server port
EXPOSE 8081

# Command to run the application
CMD ["./main"]
