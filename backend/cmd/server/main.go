package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	"ff-dashboard-mgmt/backend/internal/config"
	"ff-dashboard-mgmt/backend/internal/delivery/http"
	"ff-dashboard-mgmt/backend/internal/domain"
	"ff-dashboard-mgmt/backend/internal/infrastructure/database"
	"ff-dashboard-mgmt/backend/internal/infrastructure/external"
	"ff-dashboard-mgmt/backend/internal/infrastructure/middleware"
	"ff-dashboard-mgmt/backend/internal/logger"
	"ff-dashboard-mgmt/backend/internal/usecase"

	"github.com/gofiber/contrib/v3/websocket"
	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/cors"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
	"github.com/redis/go-redis/v9"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
	"go.uber.org/zap"
)

func main() {
	// 1. Load config
	if err := godotenv.Load(); err != nil {
		fmt.Println("Warning: no .env file found in root, using environment variables")
	}
	cfg := config.LoadConfig()
	if err := cfg.Validate(); err != nil {
		fmt.Printf("Fatal: config validation error: %v\n", err)
		os.Exit(1)
	}

	// 2. Initialize logger
	l, err := logger.NewLogger(cfg.LogLevel)
	if err != nil {
		fmt.Printf("Fatal: failed to initialize logger: %v\n", err)
		os.Exit(1)
	}
	defer l.Sync()

	l.Info("starting ff-dashboard-mgmt backend professionally")

	// 3. Context for graceful shutdown
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// 4. PostgreSQL Connection Pool
	pool, err := pgxpool.New(ctx, cfg.DBURL)
	if err != nil {
		l.Fatal("unable to connect to postgresql database", zap.Error(err))
	}
	defer pool.Close()

	// 4a. Connect directly to TimescaleDB of ff-river
	riverPool, err := pgxpool.New(ctx, cfg.RiverDBURL)
	if err != nil {
		l.Fatal("unable to connect to river TimescaleDB database", zap.Error(err))
	}
	defer riverPool.Close()

	// 5. Run Auto-Migrations
	if err := database.RunMigrations(ctx, pool, l); err != nil {
		l.Fatal("database migrations failed", zap.Error(err))
	}

	// 5a. Initialize Redis Client (Caching & Pub/Sub)
	rdb, err := database.NewRedisClient(cfg, l)
	if err != nil {
		l.Fatal("unable to connect to redis cache", zap.Error(err))
	}
	defer rdb.Close()

	// Initialize River Redis Client (connecting to ff-redis-river)
	var riverRdb *redis.Client
	l.Info("debug river redis config", zap.String("host", cfg.RiverRedisHost), zap.String("port", cfg.RiverRedisPort))
	if cfg.RiverRedisHost != "" && cfg.RiverRedisPort != "" {
		riverRdb = redis.NewClient(&redis.Options{
			Addr:     fmt.Sprintf("%s:%s", cfg.RiverRedisHost, cfg.RiverRedisPort),
			Password: cfg.RiverRedisPassword,
			DB:       0,
		})
		// Test connection
		pingCtx, pingCancel := context.WithTimeout(ctx, 3*time.Second)
		if pong, err := riverRdb.Ping(pingCtx).Result(); err != nil {
			l.Warn("unable to connect to river Redis cache", zap.Error(err))
		} else {
			l.Info("connected successfully to river Redis server", zap.String("addr", riverRdb.Options().Addr), zap.String("ping", pong))
		}
		pingCancel()
	}

	// 5b. Connect to MongoDB
	l.Info("connecting to MongoDB...", zap.String("db", cfg.MongoDBName))
	mongoCtx, mongoCancel := context.WithTimeout(ctx, 10*time.Second)
	defer mongoCancel()
	mongoClient, err := mongo.Connect(mongoCtx, options.Client().ApplyURI(cfg.MongoURI))
	if err != nil {
		l.Fatal("failed to connect to mongodb", zap.Error(err))
	}
	defer func() {
		disconnectCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = mongoClient.Disconnect(disconnectCtx)
	}()

	// 6. Dependency Injection
	userRepo, auditRepo := database.NewPostgresRepository(pool)
	fahfonRepo := database.NewFahfonRepository(pool)
	mongoRepo := database.NewMongoRepository(mongoClient, cfg.MongoDBName)

	auditUC := usecase.NewAuditLogUsecase(auditRepo, l)
	userUC := usecase.NewUserUsecase(userRepo, cfg.JWTSecret, cfg.JWTLifetime)
	fahfonUC := usecase.NewFahfonUsecase(fahfonRepo, mongoRepo, rdb)
	mongoUC := usecase.NewMongoUsecase(mongoRepo)

	// Start Background SMTP Consolidated Anomaly Notifications Worker
	go usecase.StartNotificationWorker(ctx, fahfonRepo, cfg, l)

	authHandler := http.NewAuthHandler(userUC, auditUC)
	auditHandler := http.NewAuditHandler(auditUC)
	fahfonHandler := http.NewFahfonHandler(fahfonUC)
	mongoHandler := http.NewMongoHandler(mongoUC)
	wsHandler := http.NewWebSocketHandler(rdb, l)
	riverRepo := database.NewRiverRepository(riverPool)
	streamClient := external.NewStreamClient(cfg)
	riverHandler := http.NewRiverHandler(riverRepo, riverRdb, streamClient, l, cfg.RiverServiceURL)

	// 7. Fiber App Setup
	app := fiber.New(fiber.Config{
		AppName:        "Fahfon Unified Dashboard Management",
		ReadBufferSize: 16384, // Support large headers from browser cookies (16KB)
	})

	// Enable CORS for frontend API communications
	app.Use(cors.New(cors.Config{
		AllowOrigins: []string{"*"},
		AllowHeaders: []string{"Origin", "Content-Type", "Accept", "Authorization"},
		AllowMethods: []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
	}))

	// 7.5 Health check endpoint (for Docker healthcheck / k8s probes)
	app.Get("/health", func(c fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "ok"})
	})

	// 8. Register HTTP API Routes
	api := app.Group("/api/v1")

	// Public Auth Endpoint
	api.Post("/auth/login", authHandler.Login)
	api.Get("/river/images/proxy", riverHandler.ProxyImage)

	// WebSockets Route (Publicly upgradeable, authenticates if needed or standard)
	api.Use("/ws/v1/telemetry/raw", func(c fiber.Ctx) error {
		if websocket.IsWebSocketUpgrade(c) {
			return c.Next()
		}
		return fiber.ErrUpgradeRequired
	})
	api.Get("/ws/v1/telemetry/raw", websocket.New(wsHandler.RawTelemetry))

	// Protected Routes (Session validation required)
	protected := api.Group("", middleware.AuthRequired(cfg.JWTSecret))
	protected.Get("/auth/me", authHandler.Me)
	protected.Post("/auth/change-password", authHandler.ChangePassword)

	// Fahfon Sense APIs (Accessible by all logged in roles including "user")
	protected.Get("/fahfon-sense/devices", fahfonHandler.ListDevices)
	protected.Get("/fahfon-sense/devices/:station/detail", fahfonHandler.GetDeviceDetail)
	protected.Get("/fahfon-sense/anomalies", fahfonHandler.GetAnomalies)
	protected.Get("/fahfon-sense/official-pages", fahfonHandler.GetOfficialPages)
	protected.Get("/settings/notifications", fahfonHandler.GetWarningEmails)

	// Admin/SuperAdmin Settings alert edit
	protected.Post("/settings/notifications", middleware.RolesAllowed(auditUC, domain.RoleSuperAdmin, domain.RoleAdmin), fahfonHandler.SaveWarningEmails)

	// Conflict resolver (SuperAdmin and Admin roles only)
	protected.Get("/fahfon-sense/conflicts", middleware.RolesAllowed(auditUC, domain.RoleSuperAdmin, domain.RoleAdmin), fahfonHandler.GetConflictReport)

	// Device Status Override (SuperAdmin and Admin roles only)
	protected.Put("/fahfon-sense/devices/:station/status", middleware.RolesAllowed(auditUC, domain.RoleSuperAdmin, domain.RoleAdmin), fahfonHandler.UpdateDeviceStatus)

	// Sensor Threshold Settings (SuperAdmin and Admin roles only)
	protected.Get("/fahfon-sense/thresholds", middleware.RolesAllowed(auditUC, domain.RoleSuperAdmin, domain.RoleAdmin), fahfonHandler.GetThresholds)
	protected.Put("/fahfon-sense/thresholds/:id", middleware.RolesAllowed(auditUC, domain.RoleSuperAdmin, domain.RoleAdmin), fahfonHandler.UpdateThreshold)

	// MongoDB Registrations CRUD APIs (SuperAdmin and Admin roles only)
	protected.Get("/mongo/registrations", middleware.RolesAllowed(auditUC, domain.RoleSuperAdmin, domain.RoleAdmin), mongoHandler.ListRegistrations)
	protected.Post("/mongo/registrations", middleware.RolesAllowed(auditUC, domain.RoleSuperAdmin, domain.RoleAdmin), mongoHandler.CreateRegistration)
	protected.Put("/mongo/registrations/:id", middleware.RolesAllowed(auditUC, domain.RoleSuperAdmin, domain.RoleAdmin), mongoHandler.UpdateRegistration)
	protected.Delete("/mongo/registrations/:id", middleware.RolesAllowed(auditUC, domain.RoleSuperAdmin, domain.RoleAdmin), mongoHandler.DeleteRegistration)

	// MongoDB Specifications CRUD APIs (SuperAdmin and Admin roles only)
	protected.Get("/mongo/specifications", middleware.RolesAllowed(auditUC, domain.RoleSuperAdmin, domain.RoleAdmin), mongoHandler.ListSpecifications)
	protected.Post("/mongo/specifications", middleware.RolesAllowed(auditUC, domain.RoleSuperAdmin, domain.RoleAdmin), mongoHandler.CreateSpecification)
	protected.Put("/mongo/specifications/:id", middleware.RolesAllowed(auditUC, domain.RoleSuperAdmin, domain.RoleAdmin), mongoHandler.UpdateSpecification)
	protected.Delete("/mongo/specifications/:id", middleware.RolesAllowed(auditUC, domain.RoleSuperAdmin, domain.RoleAdmin), mongoHandler.DeleteSpecification)

	// Administration: Users Management (SuperAdmin and Admin roles only)
	adminOnly := protected.Group("/users", middleware.RolesAllowed(auditUC, domain.RoleSuperAdmin, domain.RoleAdmin))
	adminOnly.Post("", authHandler.CreateUser)
	adminOnly.Get("", authHandler.ListUsers)
	adminOnly.Delete("/:id", authHandler.DeleteUser)

	// Logs Center: Audit Trail (SuperAdmin and Admin roles only)
	logsOnly := protected.Group("/logs", middleware.RolesAllowed(auditUC, domain.RoleSuperAdmin, domain.RoleAdmin))
	logsOnly.Get("", auditHandler.ListLogs)

	// River Direct DB Management API Group (Requires Authentication)
	riverGroup := protected.Group("/river")

	// Official Pages
	riverGroup.Get("/official-pages", riverHandler.GetOfficialPages)
	riverGroup.Post("/official-pages", riverHandler.CreateOfficialPage)
	riverGroup.Put("/official-pages/:id", riverHandler.UpdateOfficialPage)
	riverGroup.Delete("/official-pages/:id", riverHandler.DeleteOfficialPage)
	// Municipality Linking — Admin only: bind/unlink a Mueangsmart municipality UUID
	riverGroup.Put("/official-pages/:id/link-municipality",
		middleware.RolesAllowed(auditUC, domain.RoleSuperAdmin, domain.RoleAdmin),
		riverHandler.LinkMunicipality,
	)
	// Municipality Resolution — authenticated lookup: municipality UUID → official_page code
	// Used by ff-river-service (via gateway) to resolve page_code from municipality.id
	riverGroup.Get("/official-pages/by-municipality/:municipalityId", riverHandler.GetOfficialPageByMunicipalityID)

	// Devices
	riverGroup.Get("/devices", riverHandler.GetDevices)
	riverGroup.Post("/devices", riverHandler.CreateDevice)
	riverGroup.Get("/devices/:serial", riverHandler.GetDeviceBySerial)
	riverGroup.Put("/devices/:serial", riverHandler.UpdateDevice)
	riverGroup.Delete("/devices/:serial", riverHandler.DeleteDevice)
	riverGroup.Post("/devices/:serial/stream", riverHandler.InitializeStream)
	riverGroup.Delete("/devices/:serial/stream", riverHandler.TerminateStream)
	riverGroup.Post("/devices/:serial/ptz", riverHandler.ControlPTZ)
	riverGroup.Get("/unregistered-serials", riverHandler.GetUnregisteredSerials)
	riverGroup.Get("/unregistered-devices", riverHandler.GetUnregisteredDevices)

	// Device Calc Config
	riverGroup.Get("/devices/:serial/calc-config", riverHandler.GetDeviceCalcConfig)
	riverGroup.Post("/devices/:serial/calc-config", riverHandler.SaveDeviceCalcConfig)

	// Alert Thresholds
	riverGroup.Get("/devices/:serial/thresholds", riverHandler.GetAlertThresholds)
	riverGroup.Post("/devices/:serial/thresholds", riverHandler.CreateAlertThreshold)
	riverGroup.Put("/thresholds/:id", riverHandler.UpdateAlertThreshold)
	riverGroup.Delete("/thresholds/:id", riverHandler.DeleteAlertThreshold)

	// Alert History
	riverGroup.Get("/devices/:serial/alerts", riverHandler.GetAlertHistory)

	// Subscriptions
	riverGroup.Get("/subscriptions", riverHandler.GetSubscriptions)
	riverGroup.Post("/subscriptions", riverHandler.CreateSubscription)
	riverGroup.Put("/subscriptions/:id", riverHandler.UpdateSubscription)
	riverGroup.Delete("/subscriptions/:id", riverHandler.DeleteSubscription)

	// Freq Control
	riverGroup.Get("/devices/:serial/freq-control", riverHandler.GetFreqControl)
	riverGroup.Get("/freq-control/escalations", riverHandler.GetActiveEscalations)
	riverGroup.Post("/devices/:serial/freq-control/restore", riverHandler.RestoreFreqControl)

	// Device Health
	riverGroup.Get("/devices/:serial/health", riverHandler.GetDeviceHealth)
	riverGroup.Get("/health/offlines", riverHandler.GetOfflineDevices)

	// Data Quality
	riverGroup.Get("/devices/:serial/dq-reports", riverHandler.GetDQReports)
	riverGroup.Get("/dq-summary", riverHandler.GetDQSummary)

	// Real-time & Historical Data
	riverGroup.Get("/devices/:serial/current", riverHandler.GetLatestCurrentGroup)
	riverGroup.Get("/devices/:serial/stats", riverHandler.GetHistoricalStats)
	riverGroup.Get("/devices/:serial/warnings", riverHandler.GetWarningHistory)

	// Settings
	riverGroup.Get("/settings/:key", riverHandler.GetSetting)
	riverGroup.Post("/settings", riverHandler.SaveSetting)

	// Export System (Dynamic Column Picker + High Performance CSV Streaming)
	riverGroup.Get("/export/columns", riverHandler.GetExportableColumns)
	riverGroup.Post("/export/csv", riverHandler.ExportDevicesCSV)

	// 9. Start Server

	go func() {
		l.Info("starting fiber REST gateway", zap.String("port", cfg.AppPort))
		if err := app.Listen(fmt.Sprintf(":%s", cfg.AppPort)); err != nil {
			l.Error("fiber server failed to run", zap.Error(err))
		}
	}()

	// 10. Graceful Shutdown Wait
	<-ctx.Done()
	l.Info("gracefully terminating server instances...")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := app.ShutdownWithContext(shutdownCtx); err != nil {
		l.Error("server shutdown returned errors", zap.Error(err))
	}

	l.Info("ff-dashboard-mgmt backend stopped successfully")
}
