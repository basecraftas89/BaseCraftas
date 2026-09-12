import sanitizeHtml from 'sanitize-html';

export const BODY_TAGS = ['p','br','h2','h3','h4','strong','b','em','i','u','s','blockquote','ul','ol','li','a','img','figure','figcaption','div','span','mark','hr','pre','code'];
export function safeUrl(value, relative = false) {
  const raw = String(value || '').trim();
  if (!raw || /[\u0000-\u0020\u007f\\<>"']/.test(raw)) return '';
  try {
    const url = new URL(raw, 'https://basecraftas.com');
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return '';
    if (!relative && !/^https?:\/\//i.test(raw)) return '';
    if (raw.startsWith('//')) return '';
    // Private preview URLs are never embedded in published content.
    if (url.hostname === 'basecraftas.com' && url.pathname.startsWith('/api/column-studio/media/')) {
      return 'https://basecraftas.com/column-media/' + url.pathname.slice('/api/column-studio/media/'.length);
    }
    return raw;
  } catch { return ''; }
}

export function sanitizeBody(value) {
  return sanitizeHtml(String(value || ''), {
    allowedTags: BODY_TAGS,
    allowedAttributes: {
      '*': ['class','style'],
      div: ['class','style','data-character','contenteditable'],
      a: ['href','title','target','rel'],
      img: ['src','alt','width','height','class','loading'],
      ol: ['start'],
    },
    allowedClasses: {'*': ['editor-bubble','right','bubble-avatar','bubble-copy','character-icon','character-nameplate']},
    allowedStyles: {'*': {
      color: [/^#[0-9a-f]{3,8}$/i, /^rgb\([\d\s,.%]+\)$/i],
      'background-color': [/^#[0-9a-f]{3,8}$/i, /^rgb\([\d\s,.%]+\)$/i],
      'text-align': [/^(left|center|right)$/],
      'font-weight': [/^(bold|normal|[1-9]00)$/],
      'font-style': [/^(italic|normal)$/],
      'text-decoration': [/^(underline|line-through|none)$/],
    }},
    allowedSchemes: ['https','http'], allowProtocolRelative: false,
    transformTags: {
      a(tagName, attribs) { return {tagName, attribs: {...attribs, href: safeUrl(attribs.href, true), target: '_blank', rel: 'noopener noreferrer'}}; },
      img(tagName, attribs) { return {tagName, attribs: {...attribs, src: safeUrl(attribs.src, true)}}; },
      div(tagName, attribs) {
        if (!/^(mion|tsugumo|hakuto)-[a-z-]+$/.test(attribs['data-character'] || '')) delete attribs['data-character'];
        if (attribs.contenteditable !== 'false') delete attribs.contenteditable;
        return {tagName, attribs};
      },
    },
  });
}

export async function readBytes(request, limit) {
  if (Number(request.headers.get('content-length')) > limit) throw Object.assign(new Error('request_too_large'), {status: 413});
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  let size = 0; const chunks = [];
  try {
    while (true) {
      const {done, value} = await reader.read(); if (done) break;
      size += value.length;
      if (size > limit) throw Object.assign(new Error('request_too_large'), {status: 413});
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  const result = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}

export function imageType(bytes) {
  const match = (offset, values) => values.every((v, i) => bytes[offset+i] === v);
  if (bytes.length >= 24 && match(0,[137,80,78,71,13,10,26,10]) && match(12,[73,72,68,82])) return 'image/png';
  if (bytes.length >= 4 && match(0,[255,216,255]) && match(bytes.length-2,[255,217])) return 'image/jpeg';
  const ascii = (start,end) => String.fromCharCode(...bytes.slice(start,end));
  if (bytes.length >= 13 && ['GIF87a','GIF89a'].includes(ascii(0,6))) return 'image/gif';
  if (bytes.length >= 16 && ascii(0,4)==='RIFF' && ascii(8,12)==='WEBP') return 'image/webp';
  return '';
}

export function requestGuard(request, env, path) {
  if (!['POST','PATCH','PUT','DELETE'].includes(request.method)) return;
  const origin = new URL(request.url).origin;
  const dev = env.ALLOW_DEV_AUTH === 'true' && ['localhost','127.0.0.1','test.local'].includes(new URL(request.url).hostname);
  if (!dev && (request.headers.get('origin') !== origin || (request.headers.get('sec-fetch-site') && request.headers.get('sec-fetch-site') !== 'same-origin'))) {
    throw Object.assign(new Error('invalid_origin'), {status: 403});
  }
  const type = request.headers.get('content-type') || '';
  const multipart = path === '/api/assets' || path === '/api/customer/qualification';
  if (multipart ? !type.startsWith('multipart/form-data;') : !/^application\/json(?:;|$)/i.test(type)) {
    throw Object.assign(new Error('unsupported_content_type'), {status: 415});
  }
}

export function secureResponse(response, media = false) {
  const headers = new Headers(response.headers);
  headers.set('x-content-type-options','nosniff');
  headers.set('referrer-policy','no-referrer');
  headers.set('x-frame-options','DENY');
  headers.set('content-security-policy',"default-src 'none'; frame-ancestors 'none'; sandbox");
  if (media) headers.set('cache-control','private, no-store');
  return new Response(response.body, {status: response.status, statusText: response.statusText, headers});
}

export function safeSourceId(value) {
  return /^[A-Za-z0-9_-]{1,200}$/.test(String(value || '')) ? String(value) : '';
}
