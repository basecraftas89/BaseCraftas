from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit,urljoin,unquote
root=Path(__file__).resolve().parents[1]/'dist-projects-optimized'
class Page(HTMLParser):
 def __init__(self):super().__init__();self.refs=[];self.ids=set()
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  if tag=='meta' and a.get('property',a.get('name')) in {'og:image','twitter:image'} and a.get('content'):self.refs.append(a['content'])
  if a.get('srcset'):self.refs.extend(x.strip().split()[0] for x in a['srcset'].split(','))
  if 'id' in a:self.ids.add(a['id'])
  for k in ['src','href','poster']:
   if k in a and not (tag=='link' and a.get('rel')=='canonical'):self.refs.append(a[k])
pages={}
for f in root.rglob('*.html'):
 p=Page();p.feed(f.read_text());pages[f.relative_to(root).as_posix()]=p
checked=0
for rel,p in pages.items():
 for raw in p.refs:
  u=urlsplit(urljoin('https://basecraftas.com/'+rel,raw))
  if u.netloc!='basecraftas.com' or u.scheme not in ['http','https']:continue
  target=unquote(u.path).lstrip('/')
  if target.endswith('/') or not target:target+='index.html'
  f=root/target
  if not f.exists() and not target.startswith(('projects/meguri','projects/sleeport')):continue # Existing parent-site routes remain served by the original site.
  assert f.is_file(),(rel,raw,target)
  if u.fragment and target in pages:assert unquote(u.fragment) in pages[target].ids,(rel,raw)
  checked+=1
for f in root.rglob('*'):
 if not f.is_file():continue
 assert not any(p in {'admin','asset-review','__pycache__','.git','node_modules'} for p in f.relative_to(root).parts),f
 assert f.suffix not in {'.py','.json','.ts','.sql','.toml'},f
for slug in ['totonoe','sleeport','meguri']:
 assert 'href="'+slug+'/' in (root/'projects/index.html').read_text(),slug
 assert 'href="projects/'+slug+'/' in (root/'index.html').read_text(),slug
print({'publicPages':len(pages),'checkedInternalReferences':checked,'privateFiles':0,'result':'passed'})
