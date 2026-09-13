-- WAMERCIO 2.3.1: perfil ampliado de propietarios para el modal unificado Propietario / Negocio.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS last_name varchar(160),
  ADD COLUMN IF NOT EXISTS document_type varchar(20),
  ADD COLUMN IF NOT EXISTS document_number varchar(30),
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS gender varchar(20),
  ADD COLUMN IF NOT EXISTS identity_verified_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_owner_document_unique
  ON users(document_type, document_number)
  WHERE role='owner' AND coalesce(document_number,'')<>'';
