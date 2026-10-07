import {readFile,writeFile,mkdir,cp,stat} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../..'), source=path.join(root,'projects/totonoe');
const output=process.argv.includes('--out')?path.resolve(process.argv[process.argv.indexOf('--out')+1]):path.join(root,'dist-totonoe-public-ui');
const pages=['index.html','weekend-ai.html','service.html','seminars.html','faq.html','team.html','tayori.html','legal.html','privacy.html','cancellation.html','benefits.html','join.html','podcast.html','contents.html','characters/index.html','tsuzuri/index.html','tsumami/index.html','IROHA/index.html','IROHA/subscribe.html','TAYORI/subscribe.html','TAYORI/login.html','TAYORI/login-20261001.html'];
const files=new Set(pages), queue=[...pages], missing=[];
const allowed=/\.(?:html|css|js|json|png|jpe?g|webp|gif|svg|ico|woff2?)$/i;
function resolveReference(file,raw){
 raw=raw.replace(/&amp;/g,'&').split(/[?#]/)[0];if(!raw||raw.includes('${')||/^(?:data:|mailto:|tel:|#)/.test(raw))return null;
 if(/^https?:/.test(raw)){const url=new URL(raw);if(url.hostname!=='basecraftas.com')return null;raw=url.pathname;}
 const prefix='/projects/totonoe/';let resolved=raw.startsWith(prefix)?raw.slice(prefix.length):raw.startsWith('/')?null:path.posix.normalize(path.posix.join(path.posix.dirname(file),raw));
 if(!resolved||resolved.startsWith('../')||!allowed.test(resolved))return null;
 if(resolved.startsWith('data/')||/^(?:corporate|products)|^materials\//.test(resolved))return null;
 // Member implementation and authentication stay on their existing release.
 if(/^TAYORI\/login.*\.js$/.test(resolved))return null;
 if(/^TAYORI\//.test(resolved)&&!/^TAYORI\/(?:subscribe\.(?:html|css|js)|login(?:-20261001)?\.(?:html|js))$/.test(resolved))return null;
 if(/^IROHA\//.test(resolved)&&!/^IROHA\/(?:index\.html|subscribe\.(?:html|css)|iroha-lp\.css|annual-pricing\.css|assets\/)/.test(resolved))return null;
 return resolved;
}
for(const file of ['assets/characters/tsugumo-standard.png','assets/characters/hakuto-standard.png','assets/characters/mion-insight.png','common.js','marketing-attribution.js','home-hub.js','home-banners.json','config.js','voices.js','waitlist.js','iroha-waitlist.js','TAYORI/guide-content.json'])if(!files.has(file)){files.add(file);queue.push(file);}
while(queue.length){
 const file=queue.shift();let bytes;try{bytes=await readFile(path.join(source,file));}catch{missing.push(file);continue;}
 if(!/\.(?:html|css|js|json)$/.test(file))continue;
 const text=bytes.toString();const refs=[...text.matchAll(/(?:src|href|poster|data-philosophy-image)\s*=\s*["']([^"']+)["']/g),...text.matchAll(/url\(\s*["']?([^\s)'";]+)["']?\s*\)/g),...text.matchAll(/["']([^"'\n]+\.(?:html|css|js|json|png|jpe?g|webp|gif|svg|ico|woff2?)(?:\?[^"'\n]*)?)["']/g)];
 for(const match of refs){const ref=resolveReference(file,match[1]);if(!ref||files.has(ref))continue;try{if(!(await stat(path.join(source,ref))).isFile())continue;}catch{continue;}files.add(ref);queue.push(ref);}
}
if(missing.length)throw Error('Missing '+missing.join(','));
let bytes=0;for(const file of files){const dest=path.join(output,'projects/totonoe',file);await mkdir(path.dirname(dest),{recursive:true});await cp(path.join(source,file),dest);bytes+=(await stat(dest)).size;}
const paths=[...files].sort();await writeFile(path.join(import.meta.dirname,'manifest.json'),JSON.stringify(paths,null,2)+'\n');
console.log(JSON.stringify({files:paths.length,pages:pages.length,bytes,output}));
