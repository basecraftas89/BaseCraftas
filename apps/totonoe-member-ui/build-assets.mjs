import {readFile, mkdir, copyFile} from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
const root=resolve(import.meta.dirname,'../..');
const paths=JSON.parse(await readFile(new URL('manifest.json',import.meta.url),'utf8'));
for(const path of paths){const dest=resolve(root,'dist-totonoe-member-ui/projects/totonoe',path);await mkdir(dirname(dest),{recursive:true});await copyFile(resolve(root,'projects/totonoe',path),dest);}
console.log(`Built ${paths.length} member UI assets`);
