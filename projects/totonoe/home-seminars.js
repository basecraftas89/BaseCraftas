(function () {
  'use strict';

  var testNow = Number(window.TOTONOE_NOW);
  var now = Number.isFinite(testNow) && testNow > 0 ? testNow : Date.now();
  var cards = Array.from(document.querySelectorAll('#latest .latest-visual-card[data-seminar-start]'));
  var visibleCount = 0;

  cards.forEach(function (card) {
    var startsAt = Date.parse(card.getAttribute('data-seminar-start') || '');
    var isUpcoming = Number.isFinite(startsAt) && startsAt > now;
    card.hidden = !isUpcoming;
    if (isUpcoming) visibleCount += 1;
  });

  var emptyMessage = document.getElementById('latestSeminarEmpty');
  if (emptyMessage) emptyMessage.hidden = visibleCount !== 0;
}());
