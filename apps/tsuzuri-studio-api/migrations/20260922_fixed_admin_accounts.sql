-- Keep Studio administration limited to the two approved accounts.
UPDATE members
SET role = 'editor', updated_at = CURRENT_TIMESTAMP
WHERE role = 'admin'
  AND lower(email) NOT IN ('kansai89414@gmail.com', 'toshiki.kanto.workspace@gmail.com');

INSERT INTO members (id, email, name, role, status)
VALUES ('admin_kansai89414', 'kansai89414@gmail.com', '神藤 俊希', 'admin', 'active')
ON CONFLICT(email) DO UPDATE SET
  role = 'admin',
  status = 'active',
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO members (id, email, name, role, status)
VALUES ('admin_toshiki_kanto_workspace', 'toshiki.kanto.workspace@gmail.com', '神藤 俊希', 'admin', 'active')
ON CONFLICT(email) DO UPDATE SET
  role = 'admin',
  status = 'active',
  updated_at = CURRENT_TIMESTAMP;
