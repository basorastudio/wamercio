package database

import (
	"context"
	"errors"
	"fmt"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"
)

var migrationSlots = make(chan struct{}, migrationConcurrency())

func migrationConcurrency() int {
	configured := envInt("MIGRATION_MAX_CONCURRENCY", 2)
	if configured < 1 {
		return 1
	}
	if configured > 4 {
		return 4
	}
	return configured
}

func RunMigrations(ctx context.Context, migrationsPath, databaseURL string) error {
	select {
	case migrationSlots <- struct{}{}:
		defer func() { <-migrationSlots }()
	case <-ctx.Done():
		return ctx.Err()
	}

	migrator, err := migrate.New(migrationsPath, databaseURL)
	if err != nil {
		return fmt.Errorf("create migrator: %w", err)
	}
	defer migrator.Close()

	watcherDone := make(chan struct{})
	defer close(watcherDone)
	go func() {
		select {
		case <-ctx.Done():
			select {
			case migrator.GracefulStop <- true:
			case <-watcherDone:
			}
		case <-watcherDone:
		}
	}()

	err = migrator.Up()
	if ctx.Err() != nil {
		return ctx.Err()
	}
	if err == nil || errors.Is(err, migrate.ErrNoChange) {
		return nil
	}
	version, dirty, versionErr := migrator.Version()
	if versionErr == nil && dirty {
		return fmt.Errorf("migration version %d is dirty; manual recovery is required: %w", version, err)
	}
	return fmt.Errorf("run migrations: %w", err)
}
