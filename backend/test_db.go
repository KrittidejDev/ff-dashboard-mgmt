package main

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	connStr := "postgres://appuse:P9_vR!2x8_Safe_Riv3r@10.1.2.19:5435/ff_river?sslmode=disable"
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, connStr)
	if err != nil {
		fmt.Printf("Connection error: %v\n", err)
		return
	}
	// Query active issues
	rows, err := pool.Query(ctx, "SELECT serial, check_type, severity, message, status, detected_at FROM river_dq_active_issue ORDER BY detected_at DESC")
	if err != nil {
		fmt.Printf("Query error: %v\n", err)
		return
	}
	defer rows.Close()

	fmt.Println("Active issues in river_dq_active_issue:")
	for rows.Next() {
		var serial, checkType, severity, message, status string
		var t time.Time
		if err := rows.Scan(&serial, &checkType, &severity, &message, &status, &t); err == nil {
			fmt.Printf("- Serial: %s, Type: %s, Sev: %s, Status: %s, Time: %v, Msg: %s\n", serial, checkType, severity, status, t, message)
		}
	}
}
