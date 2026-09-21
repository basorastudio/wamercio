from pathlib import Path

root = Path(__file__).resolve().parents[1]
access = (root/'apps/web/components/access-modal.tsx').read_text(encoding='utf-8')
server = (root/'services/api/internal/httpapi/server.go').read_text(encoding='utf-8')
profile = (root/'services/api/internal/httpapi/admin_owner_integrations.go').read_text(encoding='utf-8')

# Frontend public registration profile
for token in ['last_name', 'birth_date', 'gender', 'cedula', 'province_code', 'municipality', 'neighborhood', 'street', 'street_number']:
    assert token in access, f'missing registration field/state: {token}'
assert 'formatCedula' in access, 'public registration must format Dominican cedula'
assert 'verifyRegistrationIdentity' in access, 'public registration must verify/autofill identity'
assert 'validateRegistrationWhatsApp' in access, 'public registration must validate WhatsApp for new owners'
assert 'Tipo de negocio' in access and 'Nombre del negocio' in access, 'business type and business name must be adjacent in registration step'
assert 'Provincia' in access and 'Municipio / Distrito' in access and 'Barrio' in access, 'territory selectors missing'
assert 'Fecha de nacimiento' in access and 'Género' in access, 'personal profile fields missing'
assert 'identitySubjectType' not in access, 'public owner registration must no longer offer RNC as personal document'

# Public API endpoints used by the registration UI
for route in ['/auth/store/validate-whatsapp', '/auth/store/verify-identity', '/public/territories/provinces', '/public/territories/cities', '/public/territories/neighborhoods']:
    assert route in server, f'missing public registration API route: {route}'
assert 'publicValidateRegistrationWhatsApp' in server or 'publicValidateRegistrationWhatsApp' in profile
assert 'publicVerifyRegistrationIdentity' in server or 'publicVerifyRegistrationIdentity' in profile
assert 'publicTerritoryProvinces' in server or 'publicTerritoryProvinces' in profile

# Backend registration must persist enriched owner/store data
register = server[server.find('func (s *Server) register'):server.find('func (s *Server) storeLogout')]
for token in ['LastName', 'BirthDate', 'Gender', 'Cedula', 'ProvinceCode', 'Municipality', 'Neighborhood', 'Street', 'StreetNumber']:
    assert token in register, f'register payload missing {token}'
assert 'validateOwnerWhatsAppForSave' in register, 'backend registration must validate WhatsApp via support session'
assert 'whatsapp_verified_at' in register, 'registration must persist WhatsApp verification timestamp'
assert 'document_type' in register and "'persona'" in register, 'registration must persist cedula as person identity'
assert 'birth_date' in register and 'gender' in register, 'registration must persist identity profile'
assert 'province_code' in register and 'street_number' in register, 'registration must persist business location'

print('OK: WAMERCIO 2.3.3 public registration profile regression checks')
