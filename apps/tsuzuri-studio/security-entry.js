import DOMPurify from 'dompurify';

const tags = ['p','br','h2','h3','h4','strong','b','em','i','u','s','blockquote','ul','ol','li','a','img','figure','figcaption','div','span','mark','hr','pre','code'];
function safeUrl(value, relative = false) {
  const raw = String(value || '').trim();
  if (!raw || /[\u0000-\u0020\u007f\\<>"']/.test(raw) || raw.startsWith('//')) return '';
  try {
    const url = new URL(raw, 'https://basecraftas.com');
    if (!['http:','https:'].includes(url.protocol) || url.username || url.password) return '';
    return relative || /^https?:\/\//i.test(raw) ? raw : '';
  } catch { return ''; }
}
DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
  if (['href','src'].includes(data.attrName)) data.attrValue = safeUrl(data.attrValue, true);
  if (data.attrName === 'data-character' && !/^(mion|tsugumo|hakuto)-[a-z-]+$/.test(data.attrValue)) data.keepAttr = false;
  if (data.attrName === 'style') {
    const style = document.createElement('span').style;
    style.cssText = data.attrValue;
    const allowed = ['color','background-color','text-align','font-weight','font-style','text-decoration'];
    data.attrValue = allowed.map(key => {
      const value = style.getPropertyValue(key);
      return value && !/url|expression|var\(/i.test(value) ? key + ':' + value : '';
    }).filter(Boolean).join(';');
  }
});
function body(html) {
  return DOMPurify.sanitize(String(html || ''), {
    ALLOWED_TAGS: tags,
    ALLOWED_ATTR: ['class','style','href','title','target','rel','src','alt','width','height','loading','start','data-character','contenteditable'],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    FORBID_TAGS: ['svg','math','form','input','iframe','object','embed','script','style'],
  });
}
function previewUrl(value) {
  if(location.hostname!=='basecraftas.com' && /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(String(value||'')))return value;
  const safe = safeUrl(value, true);
  if (!safe) return '';
  const url = new URL(safe, location.href);
  return url.origin === location.origin && url.pathname.startsWith('/column-media/')
    ? '/api/tsuzuri-studio/media/' + url.pathname.slice('/column-media/'.length) : safe;
}
window.TsuzuriSecurity = {body, url: safeUrl, previewUrl};
window.ColumnSecurity = window.TsuzuriSecurity;
