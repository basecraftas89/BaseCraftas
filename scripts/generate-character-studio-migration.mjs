import {readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sourceDirectory=path.join(root,'projects/totonoe/data/contents');
const output=path.join(root,'apps/tsuzuri-studio-api/migrations/20260921_character_studio_articles.sql');
const sources=[
  'character-story-tsugumo-morning-call.json',
  'character-story-hakuto-beyond-window.json',
  'character-story-mion-which-shadow.json',
  'character-story-three-same-gift.json',
];
const sql=value=>`'${String(value??'').replaceAll("'","''")}'`;
const rows=[];
for(const source of sources){
  const article=JSON.parse(await readFile(path.join(sourceDirectory,source),'utf8'));
  rows.push(`INSERT OR IGNORE INTO articles
  (id, revision, slug, title, excerpt, category, destination, content_type, tags, main_actor_id, speaker_ids, media_url,
   episode_no, source_published_at, source_type, source_id, hero_url, body_html, status, author_email, editor_email,
   published_at, created_at, updated_at)
VALUES
  (${sql(article.id)}, ${Number(article.revision)||1}, ${sql(article.slug)}, ${sql(article.title)}, ${sql(article.excerpt)},
   'character-story', 'characters', 'column', ${sql(JSON.stringify(article.tags||[]))}, ${sql(article.main_actor_id)}, '[]', '',
   NULL, '', '', '', ${sql(article.hero_url)}, ${sql(article.body_html)}, 'published', 'system@basecraftas.com', 'system@basecraftas.com',
   ${sql(article.published_at+' 00:00:00')}, ${sql(article.published_at+' 00:00:00')}, ${sql(article.updated_at)});`);
}
const header=`-- Register the four existing public character stories in ToToNoE+ Studio.
-- INSERT OR IGNORE makes this safe to apply once without overwriting later Studio edits.
`;
await writeFile(output,header+'\n'+rows.join('\n\n')+'\n');
console.log(output);
