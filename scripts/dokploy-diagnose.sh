#!/bin/sh
set -u

echo '=== WAMERCIO / Dokploy routing diagnostics 1.2.1 ==='
echo
echo '[1] Running WAMERCIO containers'
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Networks}}' | grep -E 'NAMES|wamercio' || true

echo
echo '[2] Dynamic Traefik file'
if [ -f /etc/dokploy/traefik/dynamic/wamercio.yml ]; then
  sed -n '1,220p' /etc/dokploy/traefik/dynamic/wamercio.yml
else
  echo 'MISSING: /etc/dokploy/traefik/dynamic/wamercio.yml'
fi

echo
echo '[3] dokploy-network membership'
docker network inspect dokploy-network --format '{{range $id, $c := .Containers}}{{$c.Name}} {{end}}' 2>/dev/null | tr ' ' '\n' | grep -E 'wamercio|traefik' || true

echo
echo '[4] Resolve and reach stable gateway from dokploy-network'
docker run --rm --network dokploy-network alpine:3.21 sh -c 'echo "DNS:"; getent hosts wamercio-gateway || true; echo "HTTP:"; wget -S -O- http://wamercio-gateway:8080/gateway-health' || true

echo
echo '[5] Gateway -> Next.js connectivity'
GW_ID="$(docker ps -q --filter 'name=-gateway-1' | head -n1)"
if [ -n "$GW_ID" ]; then
  docker exec "$GW_ID" sh -c 'wget -S -O- http://web:3000/health' || true
else
  echo 'gateway container not found'
fi

echo
echo '[6] Recent gateway logs'
if [ -n "$GW_ID" ]; then docker logs "$GW_ID" --tail 80 2>&1 || true; fi

echo
echo '[7] Recent Traefik lines mentioning WAMERCIO/errors'
docker logs dokploy-traefik --tail 300 2>&1 | grep -Ei 'wamercio|error|unable to find|router|service|gateway' | tail -n 120 || true

echo
echo '=== End diagnostics ==='
