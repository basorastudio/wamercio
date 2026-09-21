from pathlib import Path
import re

root=Path(__file__).resolve().parents[1]
web=root/'apps/web'

def read(rel): return (root/rel).read_text(encoding='utf-8')

def require(cond,msg):
    if not cond: raise AssertionError(msg)

shell=read('apps/web/components/store-shell.tsx')
require("{href:'/settings/profile',label:'Mi cuenta'" not in shell,'Mi cuenta sigue como item independiente del menu')
require("['Cuenta',account]" not in shell,'sigue existiendo grupo Cuenta en sidebar')
require('href="/settings/profile" title="Mi cuenta"' in shell,'la tarjeta de usuario no enlaza a /settings/profile')
require('aria-label="Abrir mi cuenta"' in shell,'falta accesibilidad en tarjeta de cuenta')
require('title="Cerrar sesión"' in shell,'se perdio accion independiente de logout')

phone=read('apps/web/components/phone-input.tsx')
require("from '@intl-tel-input/react'" in phone,'PhoneInput no usa @intl-tel-input/react')
require("from 'intl-tel-input/locale'" in phone,'PhoneInput no carga locale intl-tel-input')
require("loadUtils={()=>import('intl-tel-input/utils')}" in phone,'PhoneInput no carga utilidades intl-tel-input')
require("variant?:'default'|'dark'" in phone,'falta variante oscura para softphone')

required_files={
 'apps/web/app/calls/page.tsx':'PhoneInput required value={form.phone}',
 'apps/web/app/quotes/page.tsx':'PhoneInput required value={form.customer_phone}',
 'apps/web/app/pos/page.tsx':'PhoneInput value={customerPhone}',
 'apps/web/app/reservations/page.tsx':'PhoneInput value={form.guest_phone}',
 'apps/web/app/admin/settings/page.tsx':"PhoneInput value={data.general?.support_whatsapp||''}",
 'apps/web/components/calls-softphone.tsx':'variant="dark"',
}
for rel,needle in required_files.items():
    data=read(rel)
    require(needle in data,f'{rel}: falta Intl Telephone Input ({needle})')

# No raw telephone input can remain. Search inputs mentioning WhatsApp are allowed
# only when they are directory/search boxes rather than a telephone value field.
raw=[]
input_re=re.compile(r'<input\b[^>]*>',re.I|re.S)
for path in web.rglob('*.tsx'):
    data=path.read_text(encoding='utf-8')
    for tag in input_re.findall(data):
        low=tag.lower()
        if 'type="tel"' in low or 'inputmode="tel"' in low:
            raw.append((path.relative_to(web),tag[:180]))
            continue
        # Detect values bound to phone/WhatsApp state. Search boxes are not phone fields.
        if re.search(r'value=\{[^}]*\b(?:phone|whatsapp|guest_phone|customerphone|customer_phone|support_whatsapp)\b',tag,re.I):
            if 'search' not in low:
                raw.append((path.relative_to(web),tag[:180]))
require(not raw,'Campos telefonicos sin PhoneInput: '+repr(raw))

soft=read('apps/web/components/calls-softphone.tsx')
require("document.querySelectorAll('link[rel=\"stylesheet\"],style')" in soft,'PiP no copia estilos para intl-tel-input')
require('wamercio-phone-input--dark' in read('apps/web/app/globals.css'),'falta tema oscuro intl-tel-input')

print('PASS: WAMERCIO 4.1.11 profile navigation + global intl-tel-input regression')
