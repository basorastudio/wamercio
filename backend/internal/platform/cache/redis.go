package cache

import (
	"context"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

type Options struct {
	PoolSize     int
	MinIdleConns int
	DialTimeout  time.Duration
	ReadTimeout  time.Duration
	WriteTimeout time.Duration
}

func Connect(ctx context.Context, addr, password string, db int, options ...Options) (*redis.Client, error) {
	configured := Options{
		PoolSize:     20,
		MinIdleConns: 2,
		DialTimeout:  3 * time.Second,
		ReadTimeout:  time.Second,
		WriteTimeout: time.Second,
	}
	if len(options) > 0 {
		configured = normalizeOptions(options[0])
	}
	client := redis.NewClient(&redis.Options{
		Addr:         addr,
		Password:     password,
		DB:           db,
		PoolSize:     configured.PoolSize,
		MinIdleConns: configured.MinIdleConns,
		DialTimeout:  configured.DialTimeout,
		ReadTimeout:  configured.ReadTimeout,
		WriteTimeout: configured.WriteTimeout,
	})
	pingContext, cancel := context.WithTimeout(ctx, configured.DialTimeout)
	defer cancel()
	if err := client.Ping(pingContext).Err(); err != nil {
		_ = client.Close()
		return nil, fmt.Errorf("ping redis: %w", err)
	}
	return client, nil
}

func normalizeOptions(options Options) Options {
	if options.PoolSize <= 0 {
		options.PoolSize = 20
	}
	if options.MinIdleConns < 0 {
		options.MinIdleConns = 0
	}
	if options.MinIdleConns > options.PoolSize {
		options.MinIdleConns = options.PoolSize
	}
	if options.DialTimeout <= 0 {
		options.DialTimeout = 3 * time.Second
	}
	if options.ReadTimeout <= 0 {
		options.ReadTimeout = time.Second
	}
	if options.WriteTimeout <= 0 {
		options.WriteTimeout = time.Second
	}
	return options
}
