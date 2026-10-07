// Keep full-resolution originals; package small transparent WebP cutouts in the
// existing shared-header resource so every existing public route can load them.
import sharp from 'sharp';
import {fileURLToPath} from 'node:url';
import {readFile,writeFile} from 'node:fs/promises';
const assets={};
for(const name of ['tsugumo','hakuto','mion']){
 const file=fileURLToPath(new URL('../projects/totonoe/assets/navigation/'+name+'-peek-v2',import.meta.url));
 const bytes=await sharp(file+'.png').resize({width:240}).webp({quality:85,alphaQuality:100}).toBuffer();
 await writeFile(file+'.webp',bytes);assets[name]='data:image/webp;base64,'+bytes.toString('base64');
 console.log(name+': '+bytes.length+' bytes');
}
const target=new URL('../projects/totonoe/shared-header.js',import.meta.url);
let source=await readFile(target,'utf8');
source=source.replace(/  const characterImages = \{[\s\S]*?\};/,'  const characterImages = '+JSON.stringify(assets)+';');
await writeFile(target,source);
