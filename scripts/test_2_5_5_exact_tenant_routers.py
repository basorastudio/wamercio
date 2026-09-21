from pathlib import Path
import sys
root=Path(__file__).resolve().parents[1]
errors=[]
def need(path,text,msg):
    p=root/path
    if not p.exists(): errors.append(f'{msg}: missing {path}'); return
    s=p.read_text(errors='ignore')
    if text not in s: errors.append(f'{msg}: {text!r} not found in {path}')
def forbid(path,text,msg):
    p=root/path
    if p.exists() and text in p.read_text(errors='ignore'): errors.append(f'{msg}: forbidden {text!r} in {path}')

need(Path('services/domain-router/cmd/router/main.go'),'SELECT slug FROM stores WHERE is_active=true','active tenant host discovery')
need(Path('services/domain-router/cmd/router/main.go'),'TENANT_ROOT_DOMAIN','tenant root domain input')
need(Path('services/domain-router/cmd/router/render.go'),'certResolver: letsencrypt','per-host TLS resolver')
need(Path('docker-compose.yml'),'TENANT_ROOT_DOMAIN: ${TENANT_ROOT_DOMAIN:-ltd.do}','domain-router tenant root env')
forbid(Path('infra/traefik/wamercio.yml'),'wamercio-tenants-http:','base wildcard HTTP router should not serve tenants')
forbid(Path('infra/traefik/wamercio.yml'),'wamercio-tenants-https:','base wildcard HTTPS router should not serve tenants')
if errors:
    print('FAIL: WAMERCIO 2.5.5 exact tenant router regression')
    for e in errors: print(' -',e)
    sys.exit(1)
print('PASS: WAMERCIO 2.5.5 exact tenant router regression')
