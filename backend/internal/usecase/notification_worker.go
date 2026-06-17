package usecase

import (
	"context"
	"crypto/tls"
	"fmt"
	"net"
	"net/smtp"
	"strconv"
	"strings"
	"time"

	"ff-dashboard-mgmt/backend/internal/config"
	"ff-dashboard-mgmt/backend/internal/domain"

	"go.uber.org/zap"
)

// StartNotificationWorker starts the background goroutine that polls and aggregates anomalies into internal summary emails
func StartNotificationWorker(ctx context.Context, repo domain.FahfonRepository, cfg *config.Config, l *zap.Logger) {
	if !cfg.SMTPEnabled {
		l.Info("SMTP consolidated notification worker is disabled (SMTP_ENABLED=false)")
		return
	}

	l.Info("starting SMTP consolidated notification worker",
		zap.String("host", cfg.SMTPHost),
		zap.Int("port", cfg.SMTPPort),
		zap.Int("interval_mins", cfg.SMTPIntervalMin),
	)

	ticker := time.NewTicker(time.Duration(cfg.SMTPIntervalMin) * time.Minute)
	defer ticker.Stop()

	// Run immediately once on startup
	go processAndSendAlerts(ctx, repo, cfg, l)

	for {
		select {
		case <-ctx.Done():
			l.Info("stopping SMTP consolidated notification worker gracefully")
			return
		case <-ticker.C:
			processAndSendAlerts(ctx, repo, cfg, l)
		}
	}
}

func processAndSendAlerts(ctx context.Context, repo domain.FahfonRepository, cfg *config.Config, l *zap.Logger) {
	l.Debug("notification worker checking for new sensor anomalies")

	// 1. Fetch system warning emails
	emails, err := fetchWarningEmails(ctx, repo)
	if err != nil {
		l.Error("failed to fetch warning emails from settings", zap.Error(err))
		return
	}
	if len(emails) == 0 {
		l.Debug("no warning emails configured in system settings, skipping aggregation")
		return
	}

	// 2. Fetch last emailed anomaly ID
	lastEmailedID, err := fetchLastEmailedAnomalyID(ctx, repo)
	if err != nil {
		l.Error("failed to fetch last emailed anomaly id", zap.Error(err))
		return
	}

	// 3. Fetch new anomalies since last emailed ID
	newAnomalies, err := repo.GetNewAnomalies(ctx, lastEmailedID)
	if err != nil {
		l.Error("failed to retrieve new anomalies from database", zap.Error(err))
		return
	}

	if len(newAnomalies) == 0 {
		l.Debug("no new anomalies detected since last check")
		return
	}

	l.Info("found new anomalies to aggregate and notify", zap.Int("count", len(newAnomalies)))

	// 4. Construct beautiful HTML email body
	emailSubject := fmt.Sprintf("⚠️ Fahfon System Consolidated Alert - %d Sensor Anomalies Detected", len(newAnomalies))
	emailBody := renderHTMLAlertEmail(newAnomalies)

	// 5. Send consolidated email
	err = sendEmail(cfg, emails, emailSubject, emailBody)
	if err != nil {
		l.Error("failed to send consolidated notification email via SMTP", zap.Error(err))
		return
	}

	// 6. Update last processed anomaly ID
	maxID := lastEmailedID
	for _, anomaly := range newAnomalies {
		if anomaly.ID > maxID {
			maxID = anomaly.ID
		}
	}

	err = repo.SaveSetting(ctx, "last_emailed_anomaly_id", maxID)
	if err != nil {
		l.Error("failed to update last_emailed_anomaly_id setting in database", zap.Error(err))
	} else {
		l.Info("successfully updated notification checkpoint status", zap.Int32("last_emailed_id", maxID))
	}
}

func fetchWarningEmails(ctx context.Context, repo domain.FahfonRepository) ([]string, error) {
	setting, err := repo.GetSetting(ctx, "warning_emails")
	if err != nil {
		if err == domain.ErrNotFound {
			return []string{}, nil
		}
		return nil, err
	}

	arr, ok := setting.Value.([]any)
	if !ok {
		return []string{}, nil
	}

	var emails []string
	for _, item := range arr {
		if s, ok := item.(string); ok {
			emails = append(emails, s)
		}
	}
	return emails, nil
}

func fetchLastEmailedAnomalyID(ctx context.Context, repo domain.FahfonRepository) (int32, error) {
	setting, err := repo.GetSetting(ctx, "last_emailed_anomaly_id")
	if err != nil {
		if err == domain.ErrNotFound {
			return 0, nil
		}
		return 0, err
	}

	switch v := setting.Value.(type) {
	case float64:
		return int32(v), nil
	case int32:
		return v, nil
	case int:
		return int32(v), nil
	case string:
		if parsed, err := strconv.Atoi(v); err == nil {
			return int32(parsed), nil
		}
	}
	return 0, nil
}

func sendEmail(cfg *config.Config, to []string, subject, body string) error {
	smtpAddr := fmt.Sprintf("%s:%d", cfg.SMTPHost, cfg.SMTPPort)

	// Clean headers
	headers := make(map[string]string)
	headers["From"] = cfg.SMTPFrom
	headers["To"] = strings.Join(to, ", ")
	headers["Subject"] = subject
	headers["MIME-Version"] = "1.0"
	headers["Content-Type"] = "text/html; charset=UTF-8"

	message := ""
	for k, v := range headers {
		message += fmt.Sprintf("%s: %s\r\n", k, v)
	}
	message += "\r\n" + body

	// Helper for SMTP connection (supports standard port and SSL port 465)
	if cfg.SMTPPort == 465 {
		tlsConfig := &tls.Config{
			InsecureSkipVerify: true,
			ServerName:         cfg.SMTPHost,
		}
		conn, err := tls.Dial("tcp", smtpAddr, tlsConfig)
		if err != nil {
			return fmt.Errorf("failed to connect via SSL to %s: %w", smtpAddr, err)
		}
		defer conn.Close()

		c, err := smtp.NewClient(conn, cfg.SMTPHost)
		if err != nil {
			return fmt.Errorf("failed to create SMTP client: %w", err)
		}
		defer c.Quit()

		if cfg.SMTPUser != "" && cfg.SMTPPass != "" {
			auth := smtp.PlainAuth("", cfg.SMTPUser, cfg.SMTPPass, cfg.SMTPHost)
			if err = c.Auth(auth); err != nil {
				return fmt.Errorf("SMTP auth failed: %w", err)
			}
		}

		if err = c.Mail(cfg.SMTPUser); err != nil {
			return fmt.Errorf("failed to set SMTP sender: %w", err)
		}

		for _, addr := range to {
			if err = c.Rcpt(addr); err != nil {
				return fmt.Errorf("failed to set recipient %s: %w", addr, err)
			}
		}

		w, err := c.Data()
		if err != nil {
			return fmt.Errorf("failed to prepare data writer: %w", err)
		}
		_, err = w.Write([]byte(message))
		if err != nil {
			return fmt.Errorf("failed to write body: %w", err)
		}
		err = w.Close()
		if err != nil {
			return fmt.Errorf("failed to close data writer: %w", err)
		}
		return nil
	}

	// Default TCP Dial & standard SMTP transmission (supports STARTTLS if supported by SMTP host)
	conn, err := net.Dial("tcp", smtpAddr)
	if err != nil {
		return fmt.Errorf("failed to connect to %s: %w", smtpAddr, err)
	}
	defer conn.Close()

	c, err := smtp.NewClient(conn, cfg.SMTPHost)
	if err != nil {
		return fmt.Errorf("failed to start SMTP client: %w", err)
	}
	defer c.Quit()

	// Check if server supports STARTTLS
	if ok, _ := c.Extension("STARTTLS"); ok {
		config := &tls.Config{ServerName: cfg.SMTPHost, InsecureSkipVerify: true}
		if err = c.StartTLS(config); err != nil {
			return fmt.Errorf("STARTTLS handshake failed: %w", err)
		}
	}

	// Authentication if credentials present
	if cfg.SMTPUser != "" && cfg.SMTPPass != "" {
		auth := smtp.PlainAuth("", cfg.SMTPUser, cfg.SMTPPass, cfg.SMTPHost)
		if err = c.Auth(auth); err != nil {
			return fmt.Errorf("SMTP Plain Authentication failed: %w", err)
		}
	}

	if err = c.Mail(cfg.SMTPUser); err != nil {
		return fmt.Errorf("failed to initiate mail transaction: %w", err)
	}

	for _, addr := range to {
		if err = c.Rcpt(addr); err != nil {
			return fmt.Errorf("failed to set recipient %s: %w", addr, err)
		}
	}

	w, err := c.Data()
	if err != nil {
		return fmt.Errorf("failed to write email envelope data: %w", err)
	}
	_, err = w.Write([]byte(message))
	if err != nil {
		return fmt.Errorf("failed to transmit email payload: %w", err)
	}
	err = w.Close()
	if err != nil {
		return fmt.Errorf("failed to seal data transmission: %w", err)
	}
	return nil
}

func renderHTMLAlertEmail(anomalies []*domain.DeviceAnomaly) string {
	var builder strings.Builder

	builder.WriteString(`<!DOCTYPE html>
<html>
<head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <style>
        body {
            background-color: #0f172a;
            color: #e2e8f0;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            margin: 0;
            padding: 20px;
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #1e293b;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.5);
            border: 1px solid #334155;
        }
        .header {
            background: linear-gradient(135deg, #ef4444 0%, #b91c1c 100%);
            padding: 30px 20px;
            text-align: center;
        }
        .header h1 {
            color: #ffffff;
            margin: 0;
            font-size: 24px;
            font-weight: 700;
            letter-spacing: -0.025em;
        }
        .header p {
            color: #fca5a5;
            margin: 5px 0 0 0;
            font-size: 14px;
        }
        .content {
            padding: 30px 20px;
        }
        .brief-card {
            background-color: rgba(239, 68, 68, 0.1);
            border-left: 4px solid #ef4444;
            padding: 15px;
            border-radius: 4px;
            margin-bottom: 25px;
        }
        .brief-card p {
            margin: 0;
            color: #f87171;
            font-weight: 600;
            font-size: 15px;
        }
        .data-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 15px;
        }
        .data-table th {
            background-color: #334155;
            color: #94a3b8;
            text-align: left;
            padding: 10px;
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            border-bottom: 1px solid #475569;
        }
        .data-table td {
            padding: 12px 10px;
            border-bottom: 1px solid #334155;
            font-size: 14px;
        }
        .badge-err {
            background-color: rgba(239, 68, 68, 0.2);
            color: #f87171;
            padding: 2px 8px;
            border-radius: 9999px;
            font-size: 12px;
            font-weight: 600;
            display: inline-block;
        }
        .footer {
            background-color: #0f172a;
            padding: 20px;
            text-align: center;
            font-size: 12px;
            color: #64748b;
            border-top: 1px solid #1e293b;
        }
        .btn {
            display: inline-block;
            background-color: #ef4444;
            color: #ffffff;
            text-decoration: none;
            padding: 12px 24px;
            font-weight: 600;
            border-radius: 6px;
            margin-top: 25px;
            text-align: center;
            transition: background-color 0.2s;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Fahfon Sense System Alert</h1>
            <p>Enterprise IoT Consolidated Device Telemetry Warnings</p>
        </div>
        <div class="content">
            <div class="brief-card">
                <p>⚠️ `)

	builder.WriteString(fmt.Sprintf("%d new device anomalies and sensor out-of-bounds readings have been detected in the latest pre-processing cycle.", len(anomalies)))

	builder.WriteString(`</p>
            </div>
            
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Station</th>
                        <th>Sensor</th>
                        <th>Reported</th>
                        <th>Allowed Range</th>
                        <th>Time (Bangkok)</th>
                    </tr>
                </thead>
                <tbody>`)

	loc, _ := time.LoadLocation("Asia/Bangkok")
	if loc == nil {
		loc = time.Local
	}

	for _, a := range anomalies {
		builder.WriteString("<tr>")
		builder.WriteString(fmt.Sprintf("<td><strong>%s</strong></td>", a.DeviceID))
		builder.WriteString(fmt.Sprintf("<td><span class=\"badge-err\">%s</span></td>", a.SensorType))
		builder.WriteString(fmt.Sprintf("<td><span style=\"color: #ef4444; font-weight: bold;\">%.2f</span></td>", a.ReportedVal))
		builder.WriteString(fmt.Sprintf("<td style=\"color: #94a3b8;\">%.1f - %.1f</td>", a.MinThreshold, a.MaxThreshold))

		detectedStr := a.DetectedAt.In(loc).Format("15:04:05 (02/01)")
		builder.WriteString(fmt.Sprintf("<td style=\"font-size: 13px; color: #64748b;\">%s</td>", detectedStr))
		builder.WriteString("</tr>")
	}

	builder.WriteString(`</tbody>
            </table>
            
            <div style="text-align: center;">
                <a href="http://10.1.2.19:3000/dashboard" class="btn">Access Unified Console Dashboard</a>
            </div>
        </div>
        <div class="footer">
            <p>This is an automated internal consolidation alert from the Fahfon Sense & River IoT Management Portal.</p>
            <p>&copy; 2026 Fahfon Sense IOT. Confidential corporate communication.</p>
        </div>
    </div>
</body>
</html>`)

	return builder.String()
}
