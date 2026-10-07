(function () {
  'use strict';
  var region = document.getElementById('homeCarousel');
  if (!region) return;
  var track = document.getElementById('homeBannerTrack');
  var dots = document.getElementById('homeBannerDots');
  var grid = document.getElementById('semGrid');
  var config, slides = [], buttons = [], index = 0, timer;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var hover = false, focus = false;
  function schedule() {
    clearTimeout(timer);
    if (slides.length > 1 && !hover && !focus && !document.hidden && !reduced.matches) timer = setTimeout(function () { show(index + 1); }, 2000);
  }
  function show(next) {
    if (!slides.length) return;
    index = (next + slides.length) % slides.length;
    track.style.transform = 'translateX(-' + index * 100 + '%)';
    slides.forEach(function (slide, i) { slide.toggleAttribute('inert', i !== index); slide.querySelector('a').tabIndex = i === index ? 0 : -1; slide.setAttribute('aria-hidden', String(i !== index)); });
    buttons.forEach(function (button, i) { button.setAttribute('aria-pressed', String(i === index)); });
    schedule();
  }
  function future(seminar) {
    var end = String(seminar.time || '').match(/[〜～–-]\s*(\d{1,2}):(\d{2})/);
    var cutoff = Date.parse(seminar.date + 'T' + (end ? end[1].padStart(2,'0') + ':' + end[2] : '23:59') + ':00+09:00');
    return Number.isFinite(cutoff) && cutoff > Date.now();
  }
  function render() {
    if (!config) return;
    var seminars = (window.TOTONOE_SEMINARS || []).filter(future).sort(function(a,b){return a.date.localeCompare(b.date);});
    var items = seminars.map(function(s){return {title:s.title, date:s.dateLabel + ' ' + s.time, href:s.url, image:config.seminars[s.url], thumbnail:s.thumb};});
    items = items.concat(config.services.filter(function(s){return s.published === true;}));
    track.replaceChildren(); dots.replaceChildren(); slides=[]; buttons=[];
    items.forEach(function (item,i) {
      var slide = document.createElement('article'); slide.className = 'home-banner-slide'; slide.setAttribute('role','group'); slide.setAttribute('aria-label', (i+1)+' / '+items.length);
      var link = document.createElement('a'); link.href = item.href; link.className = 'home-banner-art'; link.setAttribute('aria-label',item.title+'の詳細を見る');
      if (item.image) {
        var image = document.createElement('img'); image.src=item.image; image.alt=item.title; image.width=2172; image.height=724; image.decoding='async'; if(i===0) image.fetchPriority='high'; link.appendChild(image);
      } else {
        link.classList.add('home-banner-pending');
        var text=document.createElement('div'), label=document.createElement('span'), title=document.createElement('strong'), date=document.createElement('span');
        label.textContent='SEMINAR';title.textContent=item.title;date.textContent=item.date; text.append(label,title,date);link.appendChild(text);
        var thumbnail=document.createElement('img');thumbnail.src=item.thumbnail;thumbnail.alt='';link.appendChild(thumbnail);
      }
      slide.appendChild(link);track.appendChild(slide);slides.push(slide);
      var button=document.createElement('button');button.type='button';button.className='home-dot';button.textContent=i+1;button.setAttribute('aria-label',(i+1)+'：'+item.title);button.addEventListener('click',function(){show(i);});dots.appendChild(button);buttons.push(button);
    });
    show(Math.min(index,slides.length-1));
  }
  document.getElementById('homePrev').addEventListener('click',function(){show(index-1);});
  document.getElementById('homeNext').addEventListener('click',function(){show(index+1);});
  var wrapper=region.parentElement;
  wrapper.addEventListener('mouseenter',function(){hover=true;schedule();});
  wrapper.addEventListener('mouseleave',function(){hover=false;schedule();});
  wrapper.addEventListener('focusin',function(){focus=true;schedule();});
  wrapper.addEventListener('focusout',function(e){focus=wrapper.contains(e.relatedTarget);schedule();});
  wrapper.addEventListener('keydown',function(e){if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();show(index+(e.key==='ArrowLeft'?-1:1));}});
  document.addEventListener('visibilitychange',function(){if(!document.hidden)render();else schedule();});
  reduced.addEventListener('change',schedule);
  if(grid)new MutationObserver(render).observe(grid,{childList:true});
  fetch('home-banners.json',{cache:'no-store'}).then(function(r){if(!r.ok)throw new Error('Banner config unavailable');return r.json();}).then(function(data){config=data;render();}).catch(function(){region.hidden=true;document.querySelector('.home-carousel-controls').hidden=true;});
})();
