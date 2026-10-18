export function restoreStudioSitemapHtml(html){
 if(!/id=["']view-dashboard["']/.test(html))return html;
 if(!html.includes('sitemap-dashboard.css'))html=html.replace('</head>','<link rel="stylesheet" href="/apps/totonoe-studio/sitemap-dashboard.css?v=20261018-home"></head>');
 if(!html.includes('sitemap-dashboard.js'))html=html.replace('</body>','<script src="/apps/totonoe-studio/sitemap-dashboard.js?v=20261018-home" defer></script></body>');
 return html;
}
