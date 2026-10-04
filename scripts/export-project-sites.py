"""Export adopted local sites into public trees; never export editor/draft data."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit, unquote
import re, shutil, argparse
from PIL import Image
p=argparse.ArgumentParser();p.add_argument('--meguri',type=Path,required=True);p.add_argument('--sleeport',type=Path,required=True);a=p.parse_args()
root=Path(__file__).resolve().parents[1]; dest=root/'projects/meguri';dest.mkdir(parents=True,exist_ok=True)
source=a.meguri/'src/meguri-site'
for f in source.rglob('*.html'):
 rel=f.relative_to(source)
 if any(part in {'admin','asset-review'} for part in rel.parts):continue
 text=f.read_text()
 # Keep sample pages out of search; public project/activities pages are discoverable.
 if not str(rel).startswith(('area/places/','articles/')):text=text.replace('<meta name="robots" content="noindex,nofollow">','')
 canonical='https://basecraftas.com/projects/meguri/'+str(rel).removesuffix('index.html')
 text=text.replace('</head>',f'<link rel="canonical" href="{canonical}"><meta property="og:title" content="MEGURI｜まちと、ひとと、いいめぐりを。"><meta property="og:image" content="https://basecraftas.com/projects/meguri/media/hero-family.png"></head>')
 out=dest/rel;out.parent.mkdir(parents=True,exist_ok=True);out.write_text(text)
for name in ['styles.css','site.js']:shutil.copy2(source/name,dest/name)
# Copy only referenced public media, compressing raster images without changing originals.
refs=set()
for f in dest.rglob('*'):
 if f.suffix in {'.html','.css','.js'}:
  refs.update(re.findall(r'/projects/meguri/(media/[^\s"\'<>?#]+|brand/[^\s"\'<>?#]+)',f.read_text()))
replacements={}
for ref in refs:
 category,rel=ref.split('/',1); src=a.meguri/('assets/site-v4' if category=='media' else 'app/public')/unquote(rel)
 assert src.is_file(),src
 target=dest/ref;target.parent.mkdir(parents=True,exist_ok=True)
 if src.suffix.lower() in {'.png','.jpg','.jpeg'}:
  target=target.with_suffix('.webp')
  with Image.open(src) as im:
   im.thumbnail((1920,1920));im.save(target,'WEBP',quality=86,method=6)
  replacements['/projects/meguri/'+ref]='/projects/meguri/'+str(target.relative_to(dest))
 else:shutil.copy2(src,target)
for f in dest.rglob('*'):
 if f.suffix in {'.html','.css','.js'}:
  text=f.read_text()
  for old,new in replacements.items():text=text.replace(old,new)
  f.write_text(text)
sp=root/'projects/sleeport';sp.mkdir(parents=True,exist_ok=True)
for f in (a.sleeport/'outputs/homepage-v2').rglob('*'):
 if not f.is_file():continue
 if f.suffix.lower() not in {'.html','.css','.js','.png','.jpg','.jpeg','.webp','.svg','.woff','.woff2','.ttf','.txt','.md'}:continue
 if f.suffix=='.md' and 'license' not in f.name.lower():continue
 out=sp/f.relative_to(a.sleeport/'outputs/homepage-v2');out.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(f,out)
 if out.suffix=='.html':
  text=out.read_text().replace('<small>© Sleeport</small>', '<small>© Sleeport · <a href="/projects/">Base Craftasのプロジェクト</a></small>'); canonical='https://basecraftas.com/projects/sleeport/'+out.name
  text=text.replace('</head>',f'<link rel="canonical" href="{canonical}"></head>');out.write_text(text)
print('Exported adopted public sites, excluding admin, draft JSON, QA and originals.')
