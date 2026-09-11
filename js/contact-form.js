(() => {
  'use strict';
  const services = {
    growth: { value: '採用ブランディング伴走（Craft Growth）', title: 'Craft Growthのご相談', description: '採用状況や施設の強み、発信・応募導線について伺います。フォームの相談種別はCraft Growthを選択済みです。' },
    flow: { value: 'AI導入・業務改善・Webアプリ開発（Craft Flow）', title: 'Craft Flowのご相談', description: 'AI活用や業務改善、Webアプリ開発について伺います。フォームの相談種別はCraft Flowを選択済みです。' },
    vital: { value: '健康資本支援（Craft Vital）', title: 'Craft Vitalのご相談', description: '職場の健康施策や実施したいテーマについて伺います。フォームの相談種別はCraft Vitalを選択済みです。' },
    other: { value: 'どのサービスが合うか相談したい', title: 'その他・サービス選びのご相談', description: '今のお困りごとから一緒に整理します。講演・研修、取材・協業はフォーム内の相談種別で選べます。' }
  };
  const params = new URLSearchParams(location.search);
  const key = params.get('service');
  const service = Object.hasOwn(services, key) ? services[key] : null;
  const url = new URL('https://docs.google.com/forms/d/e/1FAIpQLSfZWGcttTCviIKz9OmNQ6XWpREIJ7mK2MZ2ryix6YlFvEDyuQ/viewform');
  if (service) {
    // IDs verified against the Google Forms prefill screen on 2026-09-09.
    url.searchParams.set('usp', 'pp_url');
    url.searchParams.set('entry.1472144996', service.value);
    document.getElementById('serviceContextTitle').textContent = service.title;
    document.getElementById('serviceContextDesc').textContent = service.description;
    if (key === 'flow' && params.get('topic') === 'app-development') {
      url.searchParams.set('entry.1768730127', '勤怠・シフトなどのWebアプリを開発・導入したい');
      document.getElementById('serviceContextTitle').textContent = 'Craft FlowのWebアプリ開発についてのご相談';
      document.getElementById('serviceContextDesc').textContent = '相談種別はCraft Flow、改善したい内容はWebアプリ開発を選択済みです。現在の業務やお困りごとをお聞かせください。';
    }
    document.querySelectorAll('[data-service]').forEach(link => {
      if (link.dataset.service === key) link.setAttribute('aria-current', 'true');
    });
  }
  const guides = {
    growth: { label: 'Craft Growth｜採用ブランディング', title: '職場の魅力、応募する人に届いていますか？', examples: ['求人を出しても応募につながらない', '自分たちの強みを、どう伝えればよいかわからない', 'SNSや採用ページの発信を整えたい'], note: '現在の募集状況や発信媒体を、わかる範囲でお聞かせください。まだ課題が整理できていなくても構いません。' },
    flow: { label: 'Craft Flow｜AI・業務改善・アプリ開発', title: 'その手作業、仕組みにできるかもしれません。', examples: ['勤怠の集計やシフト作成に手間がかかる', '転記・集計などの繰り返し作業を減らしたい', 'AIやツールを導入したいが、何から始めるか迷っている'], note: 'GASを活用した勤怠システム・シフト作成ツールの開発・導入実績があります。マニュアルも作成し、仕組みを把握できる形でお渡ししています。今使っているツールと、困っている作業をお聞かせください。' },
    vital: { label: 'Craft Vital｜健康資本支援', title: '職場の健康づくり、どこから始めましょうか。', examples: ['従業員の疲労や身体の負担が気になっている', '睡眠・運動などをテーマにした研修を検討している', '健康施策を実施したいが、内容が決まっていない'], note: '職場全体で気になっていることや、実施したいテーマをお聞かせください。個人の診断名や詳しい健康情報は不要です。' }
  };
  if (Object.hasOwn(guides, key)) {
    const guide = guides[key];
    document.getElementById('guideLabel').textContent = guide.label;
    document.getElementById('guideTitle').textContent = guide.title;
    document.getElementById('guideNote').textContent = guide.note;
    const examples = document.getElementById('guideExamples');
    examples.replaceChildren(...guide.examples.map(text => {
      const li = document.createElement('li');
      li.textContent = text;
      return li;
    }));
  }
  document.getElementById('growthLineContact').hidden = key !== 'growth';
  document.getElementById('topExternalFormLink').href = url.toString();
  document.getElementById('externalFormLink').href = url.toString();
  url.searchParams.set('embedded', 'true');
  const frame = document.getElementById('consultationForm');
  if (frame.src !== url.toString()) frame.src = url.toString();
})();
