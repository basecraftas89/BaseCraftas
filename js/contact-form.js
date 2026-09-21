(() => {
  'use strict';
  const services = {
    growth: { formUrl: 'https://docs.google.com/forms/d/e/1FAIpQLSck2EGXILma27uWuur9B6TPXIW9vU88cCofxnYIKvZYTGE2dQ/viewform', title: 'Craft Growthのご相談' },
    flow: { formUrl: 'https://docs.google.com/forms/d/e/1FAIpQLScUFOBczVxxaALpUM5d6JD5kgsggBsKy1hinblIldeIZ7gcKw/viewform', title: 'Craft Flowのご相談' },
    vital: { formUrl: 'https://docs.google.com/forms/d/e/1FAIpQLSdj0_DNX4ltJameUMVsvGJTQJwvlS7UtOGblT2hKMQwKB4pDQ/viewform', title: 'Craft Vitalのご相談' }
  };
  const params = new URLSearchParams(location.search);
  const key = params.get('service');
  const service = Object.hasOwn(services, key) ? services[key] : null;
  const contactLayout = document.getElementById('contactLayout');
  if (service) {
    document.body.classList.add('has-selected-service');
    document.getElementById('consultation-choice-title').textContent = '相談するサービスを変更する';
    document.getElementById('contactTitle').textContent = service.title;
    document.getElementById('contactLead').textContent = key === 'growth'
      ? '30分の無料相談で採用課題を整理します。通常3営業日以内にお返事し、日程を調整します。'
      : '無料相談で、現在の課題と最初の進め方を整理します。通常3営業日以内にお返事します。';

    document.getElementById('formHeaderTitle').textContent = `${service.title}フォームへ`;
    if (key === 'flow' && params.get('topic') === 'app-development') {
      document.getElementById('contactTitle').textContent = 'Craft FlowのWebアプリ開発についてのご相談';
    }
    if (key === 'flow' && params.get('topic') === 'start-pack') {
      document.getElementById('contactTitle').textContent = 'AI導入スタートパックのご相談';
    }
    document.querySelectorAll('[data-service]').forEach(link => {
      if (link.dataset.service === key) link.setAttribute('aria-current', 'true');
    });
    const url = new URL(service.formUrl);
    document.getElementById('externalFormLink').href = url.toString();
    document.getElementById('externalFormLink').textContent = `${service.title}フォームを開く ↗`;
    contactLayout.hidden = false;
  }
  const flows = {
    growth: [['専用フォームから相談', '採用したい職種・人数、現在の発信状況や課題を、わかる範囲で送ります。'], ['通常3営業日以内にご連絡', '内容を確認し、30分の無料相談の日程を調整します。'], ['採用課題を一緒に整理', '強み・発信・見学や応募までの導線を確認し、必要な支援をご案内します。']],
    flow: [['専用フォームから相談', '改善したい業務、利用中のツール、現在のお困りごとを送ります。'], ['通常3営業日以内にご連絡', '内容を確認し、必要に応じて詳しい状況を伺う日程を調整します。'], ['最初の進め方を整理', 'AI研修・業務フロー確認・Webアプリ開発のどこから始めるかをご案内します。']],
    vital: [['専用フォームから相談', '職場の課題、希望するテーマや対象者について、わかる範囲で送ります。'], ['通常3営業日以内にご連絡', '内容を確認し、現在の状況を伺う日程を調整します。'], ['職場に合う施策を整理', '健康セミナー・課題把握・年間施策から、目的に合う始め方をご案内します。']]
  };
  if (Object.hasOwn(flows, key)) {
    const steps = document.getElementById('serviceSteps');
    steps.replaceChildren(...flows[key].map(([title, description]) => {
      const li = document.createElement('li');
      const strong = document.createElement('strong');
      strong.textContent = title;
      li.append(strong, description);
      return li;
    }));
  }
  document.getElementById('growthLineContact').hidden = key !== 'growth';
})();
