"""Create public WebP derivatives; preserve originals and record every raster."""
from pathlib import Path
from PIL import Image
from urllib.parse import urljoin,urlsplit,unquote
import re,json,html
ROOT=Path(__file__).resolve().parents[1]
records=[];mapping={}
for slug in ('meguri','sleeport'):
 base=ROOT/'projects'/slug
 for f in sorted(base.rglob('*')):
  if not f.is_file() or 'optimized' in f.parts or f.suffix.lower() not in ('.jpg','.jpeg','.png','.webp'):continue
  with Image.open(f) as original:
   original.load();w,h=original.size;im=original.convert('RGBA' if 'A' in original.getbands() or 'transparency' in original.info else 'RGB')
   rel=f.relative_to(ROOT).as_posix();dest=base/'assets/optimized'/f.relative_to(base).with_suffix('.webp');dest.parent.mkdir(parents=True,exist_ok=True)
   # Tiny stamp lettering and already small images retain their adopted source.
   if w<=512 and f.stat().st_size<70000:
    chosen=f;state='retained-small';variants=[]
   else:
    limit=640 if any(x in f.name for x in ('icon','action-','step-')) else 1280
    if 'hero' in f.name or 'footer' in f.name or 'divider' in f.name:limit=w
    full=im.copy();full.thumbnail((limit,10000),Image.Resampling.LANCZOS);full.save(dest,'WEBP',quality=86,method=6)
    if full.size==im.size and dest.stat().st_size>=f.stat().st_size*.9:
     chosen=f;state='retained-already-efficient'
    else:chosen=dest;state='optimized'
    variants=[]
    with Image.open(chosen) as best:
     for width in (480,800):
      if width>=best.width:continue
      variant=dest.with_name(dest.stem+f'-{width}w.webp');small=im.copy();small.thumbnail((width,10000),Image.Resampling.LANCZOS);small.save(variant,'WEBP',quality=86,method=6);variants.append((variant.relative_to(ROOT).as_posix(),small.width))
   with Image.open(chosen) as best:dw,dh=best.size
   item=dict(project=slug,source=rel,public=chosen.relative_to(ROOT).as_posix(),beforeBytes=f.stat().st_size,afterBytes=chosen.stat().st_size,originalWidth=w,originalHeight=h,width=dw,height=dh,status=state,variants=[dict(path=p,width=v,bytes=(ROOT/p).stat().st_size) for p,v in variants]);records.append(item);mapping[rel]=item;mapping[item['public']]=item
# Update only img tags and explicit source URL occurrences, preserving content and originals.
for f in [ROOT/'index.html',ROOT/'projects/index.html']+[p for slug in ('meguri','sleeport') for p in (ROOT/'projects'/slug).rglob('*.html')]:
 text=f.read_text();page=f.relative_to(ROOT).as_posix()
 def replace(m):
  tag=m.group(0);match=re.search(r'\bsrc=["\']([^"\']+)["\']',tag)
  if not match:return tag
  url=urlsplit(urljoin('https://basecraftas.com/'+page,html.unescape(match[1])));key=unquote(url.path).lstrip('/');item=mapping.get(key)
  if not item:return tag
  tag=tag[:match.start(1)]+'/'+item['public']+tag[match.end(1):]
  tag=re.sub(r'\s(?:srcset|sizes|width|height|decoding)=["\'][^"\']*["\']','',tag)
  attrs=f' width="{item["width"]}" height="{item["height"]}" decoding="async"'
  if item['variants']:
   choices=[f'/{v["path"]} {v["width"]}w' for v in item['variants']]+[f'/{item["public"]} {item["width"]}w']
   lazy='loading="lazy"' in tag
   attrs+=' srcset="'+', '.join(choices)+'" sizes="'+('auto, ' if lazy else '')+'100vw"'
  return tag[:-1]+attrs+'>'
 text=re.sub(r'<img\b[^>]*>',replace,text,flags=re.I)
 def meta(m):
  tag=m.group(0);a=re.search(r'content=["\']([^"\']+)["\']',tag)
  if not a:return tag
  key=unquote(urlsplit(urljoin('https://basecraftas.com/'+page,html.unescape(a[1]))).path).lstrip('/');item=mapping.get(key)
  return tag[:a.start(1)]+'https://basecraftas.com/'+item['public']+tag[a.end(1):] if item else tag
 text=re.sub(r'<meta\b[^>]*(?:og:image|twitter:image)[^>]*>',meta,text,flags=re.I)
 f.write_text(text)
report=ROOT/'outputs/project-image-audit-20261004.json';report.parent.mkdir(exist_ok=True);report.write_text(json.dumps(records,ensure_ascii=False,indent=2)+'\n')
for slug in ('meguri','sleeport'):
 r=[x for x in records if x['project']==slug];print(slug,len(r),sum(x['beforeBytes'] for x in r),sum(x['afterBytes'] for x in r),sum(v['bytes'] for x in r for v in x['variants']))
