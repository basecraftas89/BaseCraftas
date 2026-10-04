"""Combine approved character art with deterministic website wordmarks."""
from pathlib import Path
import base64
from io import BytesIO
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
for slug,label,family,weight,size,color in [('sleeport','Sleeport','Georgia, serif',700,126,'#203e4a'),('meguri','MEGURI','Arial, sans-serif',800,118,'#214c37')]:
 folder=ROOT/'projects'/slug/'assets/logos';frame=folder/(slug+'-characters-frame-v1.webp');encoded=base64.b64encode(frame.read_bytes()).decode()
 svg=f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1536 1024" role="img" aria-labelledby="title"><title id="title">{label}と3人の仲間</title><image width="1536" height="1024" href="data:image/webp;base64,{encoded}"/><text x="768" y="794" text-anchor="middle" fill="{color}" font-family="{family}" font-weight="{weight}" font-size="{size}" letter-spacing="{'-2.5' if slug=='sleeport' else '3'}">{label}</text></svg>'''
 (folder/(slug+'-project-logo-v1.svg')).write_text(svg)
 print(slug,len(svg),'bytes')

# ToToNoE+ reuses the exact adopted wordmark and existing transparent portraits.
# Place the asset under the projects Worker route, leaving the ToToNoE+ Worker untouched.
folder=ROOT/'projects/logos';folder.mkdir(exist_ok=True)
def embedded_image(path,x,y,w,h):
 buffer=BytesIO()
 with Image.open(ROOT/path) as image:image.save(buffer,'WEBP',lossless=True,method=6)
 encoded=base64.b64encode(buffer.getvalue()).decode()
 return f'<image x="{x}" y="{y}" width="{w}" height="{h}" preserveAspectRatio="xMidYMid meet" href="data:image/webp;base64,{encoded}"/>'
svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1536 1024" role="img" aria-labelledby="title"><title id="title">ToToNoE+とツグモ・ミオン・ハクト</title>'
svg+=embedded_image('projects/totonoe/assets/characters/hakuto-standard.png',588,80,360,360)
svg+=embedded_image('projects/totonoe/assets/characters/tsugumo-standard.png',36,408,360,360)
svg+=embedded_image('projects/totonoe/assets/characters/mion-standard.png',1140,408,360,360)
svg+=embedded_image('projects/totonoe/assets/totonoe-logo.png',418,530,700,275)
svg+='</svg>'
(folder/'totonoe-project-logo-v1.svg').write_text(svg)
print('totonoe',len(svg),'bytes')
