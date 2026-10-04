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

# Generated full-body ToToNoE+ trio matches the sibling logos; exact wordmark retained.
folder=ROOT/'projects/logos';folder.mkdir(exist_ok=True)
frame=base64.b64encode((folder/'totonoe-characters-frame-v2.webp').read_bytes()).decode()
buffer=BytesIO()
with Image.open(ROOT/'projects/totonoe/assets/totonoe-logo.png') as image:
 image.thumbnail((800,800),Image.Resampling.LANCZOS)
 image.save(buffer,'WEBP',lossless=True,method=6)
wordmark=base64.b64encode(buffer.getvalue()).decode()
svg=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1536 1024" role="img" aria-labelledby="title"><title id="title">ToToNoE+とツグモ・ミオン・ハクト</title><image width="1536" height="1024" href="data:image/webp;base64,{frame}"/><image x="490" y="745" width="556" height="218" preserveAspectRatio="xMidYMid meet" href="data:image/webp;base64,{wordmark}"/></svg>'
(folder/'totonoe-project-logo-v2.svg').write_text(svg)
print('totonoe v2',len(svg),'bytes')
