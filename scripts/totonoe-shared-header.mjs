export const SHARED_HEADER = `<header class="site-header totonoe-shared-header" id="siteHeader">
<div class="header-inner"><a href="/projects/totonoe/" class="brand" aria-label="ToToNoE+ トップへ"><img src="/projects/totonoe/assets/totonoe-logo.png" alt="ToToNoE+" class="brand-logo" width="1442" height="566"></a>
<a href="/projects/totonoe/TAYORI/login.html" class="home-login">会員ログイン →</a><button class="nav-toggle" id="navToggle" aria-label="メニューを開く" aria-controls="siteNav" aria-expanded="false"><span></span><span></span><span></span></button></div>
<nav class="site-nav home-navigation" id="siteNav" aria-label="メインナビゲーション">
<div class="nav-dropdown"><a class="nav-main" href="/projects/totonoe/seminars.html">セミナー</a><button class="header-menu-toggle" aria-label="セミナーの項目を開く" aria-expanded="false">⌄</button><div class="nav-menu"><a href="/projects/totonoe/weekend-ai.html">週末のAI整え習慣</a></div></div>
<div class="nav-dropdown"><a class="nav-main" href="/projects/totonoe/contents.html">コンテンツ</a><button class="header-menu-toggle" aria-label="コンテンツの項目を開く" aria-expanded="false">⌄</button><div class="nav-menu"><a href="/projects/totonoe/tsuzuri/">つづり｜TSUZURI</a><a href="/projects/totonoe/tsumami/">つまみ｜TSUMAMI</a></div></div>
<div class="nav-dropdown"><a class="nav-main" href="/projects/totonoe/service.html">サービス</a><button class="header-menu-toggle" aria-label="サービスの項目を開く" aria-expanded="false">⌄</button><div class="nav-menu"><a href="/projects/totonoe/tayori.html">たより｜TAYORI</a><a href="/projects/totonoe/IROHA/">いろは｜IROHA</a></div></div>
<div class="nav-dropdown"><a class="nav-main" href="/projects/totonoe/team.html">ToToNoE+について</a><button class="header-menu-toggle" aria-label="ToToNoE+についての項目を開く" aria-expanded="false">⌄</button><div class="nav-menu"><a href="/projects/totonoe/team.html">チーム</a><a href="/projects/totonoe/characters/">キャラクターと世界観</a><a href="/projects/totonoe/faq.html">よくある質問</a></div></div>
</nav></header>`;

export function applySharedHeader(html) {
  if (!/<body\b/i.test(html) || /http-equiv=["']refresh/i.test(html)) return html;
  html = html.replace(/<header\b[^>]*\bid=["']siteHeader["'][^>]*>[\s\S]*?<\/header>/i, '');
  html = html.replace(/<header\b[^>]*class=["']page-header["'][^>]*>[\s\S]*?<\/header>/i, '');
  html = html.replace(/<body\b([^>]*)>/i, (_, attrs) => {
    attrs = /class=/.test(attrs) ? attrs.replace(/class=["']([^"']*)["']/, (_, cls) => `class="${cls.replace(/\btotonoe-header-layout\b/g, '').trim()} totonoe-header-layout"`) : attrs + ' class="totonoe-header-layout"';
    return `<body${attrs}>${SHARED_HEADER}`;
  });
  html = html.replace(/<link\b[^>]*href=["'][^"']*shared-header\.css[^"']*["'][^>]*>/g, '').replace(/<script\b[^>]*src=["'][^"']*shared-header\.js[^"']*["'][^>]*>[\s\S]*?<\/script>/g, '');
  return html.replace('</head>', '<link rel="stylesheet" href="/projects/totonoe/shared-header.css?v=20261005-content-label-v6"><script src="/projects/totonoe/shared-header.js?v=20261005-content-label-v6" defer></script></head>');
}
