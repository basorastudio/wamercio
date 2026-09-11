#!/bin/sh
set -u

echo '=== WAMERCIO / Dokploy routing diagnostics ==='
echo
echo '[1] Running WAMERCIO containers'
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Networks}}' | grep -E 'NAMES|wamercio' || true

echo
echo '[2] web container networks and labels'
WEB_ID="$(docker ps -q --filter 'name=wamercio-vwfk00-web-1' | head -n1)"
if [ -z "$WEB_ID" ]; then
  WEB_ID="$(docker ps -q --filter 'name=-web-1' | head -n1)"
fi
if [ -n "$WEB_ID" ]; then
  docker inspect "$WEB_ID" --format 'Networks: {{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}'
  docker inspect "$WEB_ID" --format '{{range $k, $v := .Config.Labels}}{{if eq $k "traefik.enable"}}{{$k}}={{$v}}{{end}}{{end}}' || true
else
  echo 'web container not found'
fi

echo
echo '[3] Dynamic Traefik file'
if [ -f /etc/dokploy/traefik/dynamic/wamercio.yml ]; then
  sed -n '1,200p' /etc/dokploy/traefik/dynamic/wamercio.yml
else
  echo 'MISSING: /etc/dokploy/traefik/dynamic/wamercio.yml'
fi

echo
echo '[4] dokploy-network membership'
docker network inspect dokploy-network --format '{{range $id, $c := .Containers}}{{$c.Name}} {{end}}' 2>/dev/null | tr ' ' '\n' | grep -E 'wamercio|traefik' || true

echo
echo '[5] Recent Traefik lines mentioning WAMERCIO/errors'
docker logs dokploy-traefik --tail 250 2>&1 | grep -Ei 'wamercio|error|unable to find|router|service' | tail -n 80 || true

echo
echo '=== End diagnostics ==='
