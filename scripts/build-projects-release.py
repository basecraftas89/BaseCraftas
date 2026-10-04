"""Build only the adopted static sites and current parent-page dependencies."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit, unquote, urljoin
import re,shutil
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'dist-projects-optimized';OUT.mkdir(exist_ok=True)
class Resources(HTMLParser):
 def __init__(self):super().__init__();self.urls=[]
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  if tag=='meta' and a.get('property',a.get('name')) in {'og:image','twitter:image'} and a.get('content'):self.urls.append(a['content'])
  if tag in ['img','script','source','video','audio']:
   for key in ['src','poster']:
    if a.get(key):self.urls.append(a[key])
  if a.get('srcset'):self.urls.extend(x.strip().split()[0] for x in a['srcset'].split(','))
  if tag=='link' and a.get('rel') not in ['canonical'] and a.get('href'):self.urls.append(a['href'])
queue=['index.html','projects/index.html']+[str(p.relative_to(ROOT)) for slug in ['meguri','sleeport'] for p in (ROOT/'projects'/slug).rglob('*') if p.is_file() and p.suffix in {'.html','.css','.js','.txt'}];done=set()
while queue:
 rel=queue.pop()
 if rel in done:continue
 assert '..' not in Path(rel).parts and not rel.startswith(('.','work/','apps/')),rel
 f=ROOT/rel;assert f.is_file(),rel
 done.add(rel);target=OUT/rel;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(f,target)
 urls=[]
 if f.suffix=='.html':p=Resources();p.feed(f.read_text());urls=p.urls
 if f.suffix=='.css':urls=re.findall(r'url\([\s\"\']*([^\)\"\']+)',f.read_text())
 for raw in urls:
  u=urlsplit(urljoin('https://basecraftas.com/'+rel,raw))
  if u.netloc!='basecraftas.com' or u.scheme not in ['https','http']:continue
  queue.append(unquote(u.path).lstrip('/'))
(OUT/'_headers').write_text('''/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Content-Security-Policy: object-src 'none'; base-uri 'self'; frame-ancestors 'none'
  X-BaseCraftas-Projects-Release: 20261004
''')
(OUT/'404.html').write_text('<!doctype html><html lang="ja"><meta charset="utf-8"><title>ページが見つかりません</title><h1>ページが見つかりません</h1><a href="/projects/">プロジェクト一覧へ</a></html>')
files=[p for p in OUT.rglob('*') if p.is_file()]
assert {p.relative_to(OUT).as_posix() for p in files} == done | {'_headers','404.html'}, 'Stale files: rebuild into a fresh output directory'
assert len(files)<20000
assert all(p.stat().st_size<25*1024**2 for p in files)
print({'files':len(files),'MiB':round(sum(p.stat().st_size for p in files)/1024**2,2),'runtime':'static assets only','r2':False})
