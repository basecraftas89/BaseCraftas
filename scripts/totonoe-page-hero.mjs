export const PAGE_HERO_IMAGES={
  seminars:{src:'/projects/totonoe/assets/page-hero-seminars-v1.webp',alt:'湖畔のテーブルを囲み、一枚のカードから一緒に学ぶハクト・ツグモ・ミオン'},
  service:{src:'/projects/totonoe/assets/page-hero-service-v1.webp',alt:'湖畔の小屋で、大切な情報と学びを届け合うツグモ・ミオン・ハクト'},
  faq:{src:'/projects/totonoe/assets/page-hero-faq-v1.webp',alt:'湖畔でミオンの問いに耳を傾け、安心して話せる時間をつくるハクトとツグモ'}
};
export function applyPageHero(html,key){
 const image=PAGE_HERO_IMAGES[key];if(!image)return html;
 const section=key==='seminars'?/<section\b[^>]*class="seminar-list-hero"[^>]*>[\s\S]*?<\/section>/:key==='service'?/<section\b[^>]*class="[^"]*service-page-hero[^"]*"[^>]*>[\s\S]*?<\/section>/:/<section\b[^>]*class="page-hero"[^>]*>[\s\S]*?<\/section>/;
 html=html.replace(section,hero=>hero.includes('page-world-banner')?hero:hero.replace(/<section\b([^>]*)>/,(_,attrs)=>'<section'+attrs.replace(/class="([^"]*)"/,(_,cls)=>`class="${cls} page-world-hero"`)+'>').replace('</section>',`<figure class="page-world-banner"><img src="${image.src}" alt="${image.alt}" width="1800" height="600" fetchpriority="high" decoding="async"></figure></section>`));
 if(!html.includes('page-world-hero.css'))html=html.replace('</head>','<link rel="stylesheet" href="/projects/totonoe/page-world-hero.css?v=20261003a"></head>');return html;
}
