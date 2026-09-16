from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]

# pgx/v5 pgconn.CommandTag.RowsAffected() returns a single int64.
# A two-value assignment compiles neither in Go 1.26 nor in the production
# Go 1.27 Docker image, and was the direct cause of the Dokploy 2.8.0 failure.
invalid_rows_affected = re.compile(
    r"\b[A-Za-z_][A-Za-z0-9_]*\s*,\s*_\s*:=\s*[A-Za-z_][A-Za-z0-9_]*\.RowsAffected\(\)"
)
violations = []
for go_file in (root / "services").rglob("*.go"):
    body = go_file.read_text(encoding="utf-8")
    for match in invalid_rows_affected.finditer(body):
        line = body.count("\n", 0, match.start()) + 1
        violations.append(f"{go_file.relative_to(root)}:{line}: {match.group(0)}")
assert not violations, "invalid pgx RowsAffected tuple assignments:\n" + "\n".join(violations)

# Keep CI as the authoritative full compiler/build gate before production.
ci = (root / ".github/workflows/ci.yml").read_text(encoding="utf-8")
for required in ["go test ./...", "go build ./...", "npm run build", "docker compose config"]:
    assert required in ci, f"CI missing production gate: {required}"

api_docker = (root / "services/api/Dockerfile").read_text(encoding="utf-8")
assert "go build -mod=readonly" in api_docker, "API Dockerfile must compile with readonly modules"

print("PASS: WAMERCIO 2.8.1 production compile guards")
