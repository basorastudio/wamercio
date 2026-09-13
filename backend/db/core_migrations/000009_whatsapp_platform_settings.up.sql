INSERT INTO platform_settings (key, value)
VALUES ('whatsapp_platform', '{
  "enabled": true,
  "session_id": "",
  "session_name": "WAMERCIO",
  "status": "pending",
  "connected": false,
  "logged_in": false,
  "jid": "",
  "phone": "",
  "profile_name": "",
  "profile_picture_url": ""
}'::jsonb)
ON CONFLICT (key) DO NOTHING;
