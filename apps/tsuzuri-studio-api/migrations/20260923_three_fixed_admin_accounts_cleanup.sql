-- Preserve the original member row if a case-only duplicate was created.
DELETE FROM members
WHERE id = 'admin_base_craftas478'
  AND EXISTS (
    SELECT 1
    FROM members AS existing
    WHERE lower(existing.email) = 'base.craftas478@gmail.com'
      AND existing.id <> members.id
  );

UPDATE members
SET role = 'admin', status = 'active', updated_at = CURRENT_TIMESTAMP
WHERE lower(email) IN (
  'toshiki.kanto.workspace@gmail.com',
  'kansai89414@gmail.com',
  'base.craftas478@gmail.com'
);
