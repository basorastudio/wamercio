ALTER TABLE system_users DROP CONSTRAINT IF EXISTS system_users_role_check;
ALTER TABLE system_users ADD CONSTRAINT system_users_role_check CHECK (role IN ('administrator', 'cashier', 'delivery_driver'));
