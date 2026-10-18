export function restoreStudioAnalyticsHtml(html){
 if(!html.includes('id="view-analytics"'))return html;
 return html.replace(/<script\b[^>]*src=["'][^"']*\/journey-dashboard\.js(?:\?[^"']*)?["'][^>]*>\s*<\/script>/gi,'').replace(/<link\b[^>]*href=["'][^"']*\/journey-dashboard\.css(?:\?[^"']*)?["'][^>]*>/gi,'').replace('</head>','<link rel="stylesheet" href="/apps/totonoe-studio/journey-dashboard.css?v=20261018-restore"></head>').replace('</body>','<script src="/apps/totonoe-studio/journey-dashboard.js?v=20261018-restore"></script></body>');
}
