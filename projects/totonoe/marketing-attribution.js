/* Public ToToNoE+ journey events. No email, form values, or customer IDs are sent. */
(function () {
  'use strict';

  if (window.__TOTONOE_MARKETING_TRACKING__) return;
  window.__TOTONOE_MARKETING_TRACKING__ = true;

  var host = window.location.hostname;
  if (host !== 'basecraftas.com' && host !== 'www.basecraftas.com') return;
  var path = window.location.pathname;
  if (!path.startsWith('/projects/totonoe/')) return;
  if (/\/TAYORI\/(?!subscribe\.html$)|\/IROHA\//.test(path)) return;

  var measurementId = 'G-1SK6NEFC8V';
  if (typeof window.gtag !== 'function') {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', measurementId);
    var script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + measurementId;
    document.head.appendChild(script);
  }

  function track(name, params) {
    if (typeof window.gtag === 'function') window.gtag('event', name, params || {});
  }

  function targetFor(link) {
    var url;
    try { url = new URL(link.href, window.location.href); } catch (_) { return null; }
    if (url.hostname === 'therapis10.com' && url.pathname.startsWith('/seminars/')) {
      return { name: 'seminar_cta_click', target: 'seminar', destination: 'therapis10_seminar' };
    }
    if (url.hostname !== 'basecraftas.com' && url.hostname !== 'www.basecraftas.com') return null;
    if (/^\/projects\/totonoe\/tayori(?:\.html)?\/?$/.test(url.pathname)) {
      return { name: 'tayori_cta_click', target: 'tayori', destination: 'tayori_landing' };
    }
    if (url.pathname === '/projects/totonoe/TAYORI/subscribe.html') {
      return { name: 'tayori_cta_click', target: 'tayori', destination: 'tayori_enrollment' };
    }
    return null;
  }

  document.addEventListener('click', function (event) {
    var link = event.target.closest && event.target.closest('a[href]');
    if (!link) return;
    var match = targetFor(link);
    if (!match) return;
    track(match.name, {
      cta_target: match.target,
      cta_destination: match.destination,
      cta_origin_path: path,
      cta_area: link.closest('header') ? 'header' : link.closest('footer') ? 'footer' : link.closest('.sem-modal') ? 'seminar_modal' : link.closest('.sem-card') ? 'seminar_card' : 'page'
    });
  });

  window.ToToNoEMarketing = Object.freeze({
    trackWaitlistSuccess: function (interest) {
      if (interest === 'tayori_personal') track('tayori_waitlist_signup', { cta_target: 'tayori' });
    },
    trackCheckoutStart: function () {
      track('tayori_checkout_start', { cta_target: 'tayori' });
    }
  });
})();
