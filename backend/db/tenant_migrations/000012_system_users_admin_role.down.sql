UPDATE system_users SET role='cashier' WHERE role='administrator';
ALTER TABLE system_users DROP CONSTRAINT IF EXISTS system_users_role_check;
ALTER TABLE system_users ADD CONSTRAINT system_users_role_check CHECK (role IN ('cashier', 'delivery_driver'));
