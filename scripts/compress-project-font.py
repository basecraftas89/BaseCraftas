"""Lossless WOFF2 conversion. Requires fonttools[woff]; retains full character set."""
from pathlib import Path
from fontTools.ttLib import TTFont
root=Path(__file__).resolve().parents[1]
source=root/'projects/sleeport/assets/v2/fonts/KleeOne-SemiBold.ttf'
font=TTFont(source);cmap=font.getBestCmap();glyphs=font['maxp'].numGlyphs
font.flavor='woff2';target=source.with_suffix('.woff2');font.save(target)
result=TTFont(target)
assert result.getBestCmap()==cmap and result['maxp'].numGlyphs==glyphs
print({'sourceBytes':source.stat().st_size,'publicBytes':target.stat().st_size,'glyphs':glyphs})

for css in (root/"projects/sleeport").rglob("*.css"):
 text=css.read_text().replace("KleeOne-SemiBold.ttf","KleeOne-SemiBold.woff2").replace("format(\"truetype\")","format(\"woff2\")").replace("format('truetype')","format('woff2')")
 css.write_text(text)
