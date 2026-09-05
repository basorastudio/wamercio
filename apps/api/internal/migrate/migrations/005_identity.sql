CREATE TABLE identity_people(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_hash char(64) UNIQUE NOT NULL,
  document_masked varchar(24) NOT NULL,
  full_name varchar(220) NOT NULL,
  given_names varchar(180),
  surnames varchar(180),
  first_name varchar(100),
  second_name varchar(100),
  first_surname varchar(100),
  second_surname varchar(100),
  birth_date date,
  sex varchar(12),
  name_split_reliable boolean NOT NULL DEFAULT false,
  source varchar(80),
  last_request_id varchar(128),
  verified_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE identity_companies(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rnc varchar(20) UNIQUE NOT NULL,
  legal_name varchar(220) NOT NULL,
  trade_name varchar(220),
  status varchar(80),
  active boolean NOT NULL DEFAULT false,
  source varchar(80),
  last_request_id varchar(128),
  verified_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE users ADD COLUMN identity_person_id uuid REFERENCES identity_people(id);
ALTER TABLE tenants ADD COLUMN legal_subject_type varchar(20) NOT NULL DEFAULT 'persona' CHECK(legal_subject_type IN('persona','empresa'));
ALTER TABLE tenants ADD COLUMN identity_company_id uuid REFERENCES identity_companies(id);
ALTER TABLE tenants ADD COLUMN legal_name varchar(220);
ALTER TABLE tenants ADD COLUMN trade_name varchar(220);
ALTER TABLE tenants ADD COLUMN identity_verified_at timestamptz;
ALTER TABLE customers ADD COLUMN identity_person_id uuid REFERENCES identity_people(id);
ALTER TABLE customers ADD COLUMN identity_verified_at timestamptz;
ALTER TABLE orders ADD COLUMN customer_identity_verified boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX idx_customers_tenant_identity ON customers(tenant_id,identity_person_id) WHERE identity_person_id IS NOT NULL;
CREATE INDEX idx_users_identity_person ON users(identity_person_id) WHERE identity_person_id IS NOT NULL;
CREATE INDEX idx_customers_identity_person ON customers(identity_person_id) WHERE identity_person_id IS NOT NULL;
