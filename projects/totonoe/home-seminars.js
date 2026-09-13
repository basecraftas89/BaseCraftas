(function () {
  'use strict';

  var testNow = Number(window.TOTONOE_NOW);
  var now = Number.isFinite(testNow) && testNow > 0 ? testNow : Date.now();
  var cards = Array.from(document.querySelectorAll('#latest .latest-visual-card[data-seminar-start]'));
  var recurringCard = document.querySelector('#latest .recurring-seminar-card');
  var visibleCount = 0;

  cards.forEach(function (card) {
    var startsAt = Date.parse(card.getAttribute('data-seminar-start') || '');
    var endsAt = Date.parse(card.getAttribute('data-seminar-end') || '');
    var displayUntil = Number.isFinite(endsAt) ? endsAt : startsAt;
    var isUnfinished = Number.isFinite(startsAt) && displayUntil > now;
    card.hidden = !isUnfinished;
    if (isUnfinished) visibleCount += 1;
  });

  var emptyMessage = document.getElementById('latestSeminarEmpty');
  if (emptyMessage) emptyMessage.hidden = Boolean(recurringCard) || visibleCount !== 0;
}());
