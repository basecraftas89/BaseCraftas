ALTER TABLE articles ADD COLUMN main_actor_id TEXT NOT NULL DEFAULT 'shindo-toshiki';
ALTER TABLE article_versions ADD COLUMN main_actor_id TEXT NOT NULL DEFAULT 'shindo-toshiki';

UPDATE articles
   SET destination = 'totonoe',
       main_actor_id = COALESCE(NULLIF(main_actor_id, ''), 'shindo-toshiki')
 WHERE destination = 'basecraftas'
    OR destination = 'Base Craftas コラム'
    OR destination = '';

UPDATE article_versions
   SET destination = 'totonoe',
       main_actor_id = COALESCE(NULLIF(main_actor_id, ''), 'shindo-toshiki')
 WHERE destination = 'basecraftas'
    OR destination = 'Base Craftas コラム'
    OR destination = '';
