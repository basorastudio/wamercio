package database

import (
	"context"
	"errors"
	"fmt"
	"log"
	"time"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

func Open(ctx context.Context, url string) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		return nil, err
	}
	cfg.MaxConns = 20
	cfg.MinConns = 2
	cfg.MaxConnLifetime = time.Hour
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	return pool, nil
}

func Migrate(databaseURL string) error {
	m, err := migrate.New("file:///app/migrations", databaseURL)
	if err != nil {
		return fmt.Errorf("create migrator: %w", err)
	}
	defer m.Close()
	if err := m.Up(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
		return err
	}
	return nil
}

func EnsureAdmin(ctx context.Context, db *pgxpool.Pool, name, email, password string) error {
	var count int
	if err := db.QueryRow(ctx, `SELECT COUNT(*) FROM users WHERE email=$1`, email).Scan(&count); err != nil {
		return err
	}
	if count > 0 {
		return nil
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	var id string
	err = db.QueryRow(ctx, `INSERT INTO users (name,email,password_hash,role,status) VALUES ($1,$2,$3,'superadmin','active') RETURNING id`, name, email, string(hash)).Scan(&id)
	if err != nil {
		return err
	}
	var planID string
	if e := db.QueryRow(ctx, `SELECT id FROM plans WHERE slug='pro' LIMIT 1`).Scan(&planID); e == nil {
		_, _ = db.Exec(ctx, `INSERT INTO subscriptions(user_id,plan_id,status) VALUES($1,$2,'active') ON CONFLICT(user_id) DO NOTHING`, id, planID)
	}
	log.Printf("usuario administrador inicial creado: %s", email)
	return nil
}
