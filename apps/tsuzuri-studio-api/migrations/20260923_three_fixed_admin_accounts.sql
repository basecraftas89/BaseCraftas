-- Keep Studio administration limited to the three approved accounts.
UPDATE members
SET role = 'editor', updated_at = CURRENT_TIMESTAMP
WHERE role = 'admin'
  AND lower(email) NOT IN (
    'toshiki.kanto.workspace@gmail.com',
    'kansai89414@gmail.com',
    'base.craftas478@gmail.com'
  );

UPDATE members SET role = 'admin', status = 'active', updated_at = CURRENT_TIMESTAMP
WHERE lower(email) = 'toshiki.kanto.workspace@gmail.com';

INSERT INTO members (id, email, name, role, status)
SELECT 'admin_toshiki_kanto_workspace', 'toshiki.kanto.workspace@gmail.com', '神藤 俊希', 'admin', 'active'
WHERE NOT EXISTS (SELECT 1 FROM members WHERE lower(email) = 'toshiki.kanto.workspace@gmail.com');

UPDATE members SET role = 'admin', status = 'active', updated_at = CURRENT_TIMESTAMP
WHERE lower(email) = 'kansai89414@gmail.com';

INSERT INTO members (id, email, name, role, status)
SELECT 'admin_kansai89414', 'kansai89414@gmail.com', '神藤 俊希', 'admin', 'active'
WHERE NOT EXISTS (SELECT 1 FROM members WHERE lower(email) = 'kansai89414@gmail.com');

UPDATE members SET role = 'admin', status = 'active', updated_at = CURRENT_TIMESTAMP
WHERE lower(email) = 'base.craftas478@gmail.com';

INSERT INTO members (id, email, name, role, status)
SELECT 'admin_base_craftas478', 'base.craftas478@gmail.com', 'Base Craftas', 'admin', 'active'
WHERE NOT EXISTS (SELECT 1 FROM members WHERE lower(email) = 'base.craftas478@gmail.com');
