import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {resolve} from 'node:path';

// The existing weekly content arrays remain the source of truth.
export async function weekendMediaData() {
  const source=await readFile(resolve(import.meta.dirname,'../../projects/totonoe/service-content.js'),'utf8');
  function array(name) {
    const match=source.match(new RegExp('var '+name+' = (\\[[\\s\\S]*?\\n  \\]);'));
    if(!match)throw new Error('Missing weekly source: '+name);
    return runInNewContext(match[1],{}, {timeout:1000});
  }
  const archives = array('ARCHIVES').map(a => ({no:a.no,date:a.date,title:a.title,id:a.driveId}));
  const dates = new Map(archives.map(a => [a.no, a.date]));
  const podcasts = array('EPISODES').map(a => {
    // Both media belong to the same weekly event; use its year-bearing date.
    const date = dates.get(a.no) || a.date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Weekly episode needs a full date: ' + a.no);
    return {no:a.no,date,title:a.theme,id:a.url.split('/').at(-1)};
  });
  return {archives, podcasts};
}
