(() => {
  // outputs/studio-analytics-redesign-20261019/src/analytics-model.mjs
  var media = { direct: "\u76F4\u63A5\u30FB\u5224\u5225\u4E0D\u80FD", x: "X", instagram: "Instagram", facebook: "Facebook", line: "LINE", note: "note", youtube: "YouTube", threads: "Threads", linkedin: "LinkedIn", sns: "SNS\u5171\u901A", eight: "Eight", prairie_card: "\u30D7\u30EC\u30FC\u30EA\u30FC\u30AB\u30FC\u30C9", search_google: "Google\u691C\u7D22", search_bing: "Bing\u691C\u7D22", search_yahoo: "Yahoo!\u691C\u7D22", ai_chatgpt: "ChatGPT", ai_perplexity: "Perplexity", ai_claude: "Claude", ai_gemini: "Gemini" };
  var people = [["kanto-toshiki", "\u795E\u85E4 \u4FCA\u5E0C"], ["kajiwara-yusuke", "\u68B6\u539F \u7950\u8F14"], ["kimura-koharu", "\u6728\u6751 \u5016\u6674"], ["ito-masaya", "\u4F0A\u6771 \u96C5\u4E5F"], ["tsunashima-shu", "\u7DB1\u5CF6 \u8129"], ["kojima-ken", "\u5C0F\u5CF6 \u5065"], ["kaigaishi-shogo", "\u8C9D\u30F6\u77F3 \u7965\u543E"], ["kuroishi-ryota", "\u9ED2\u77F3 \u6DBC\u592A"], ["kaito-taisho", "\u6D77\u85E4 \u5927\u5C06"], ["nakagawa-masahiro", "\u4E2D\u5DDD \u7406\u6D69"]];
  var aliases = { "/projects/totonoe/index.html": "/projects/totonoe/", "/projects/totonoe/index": "/projects/totonoe/" };
  for (const name of ["tayori", "service", "contents", "weekend-ai", "seminars", "team", "faq", "privacy", "tokusho", "cancel"]) aliases["/projects/totonoe/" + name + ".html"] = "/projects/totonoe/" + name;
  function canonical(p) {
    return aliases[p] || p;
  }
  function pageName(p) {
    p = canonical(p);
    return { "/projects/totonoe/": "ToToNoE+ \u30C8\u30C3\u30D7", "/projects/totonoe/tayori": "TAYORI\u306E\u6848\u5185", "/projects/totonoe/service": "\u30B5\u30FC\u30D3\u30B9\u4E00\u89A7", "/projects/totonoe/tsuzuri/": "\u3064\u3065\u308A\u4E00\u89A7", "/projects/totonoe/tsumami/": "\u3064\u307E\u307F\u4E00\u89A7", "/projects/totonoe/IROHA/index.html": "IROHA\u306E\u6848\u5185", "/projects/totonoe/seminars": "\u30BB\u30DF\u30CA\u30FC\u4E00\u89A7" }[p] || p;
  }
  function totals(links = []) {
    return Object.fromEntries(["visits", "signup_sessions", "checkout_sessions", "completed_sessions", "recurring_sessions"].map((k) => [k, links.reduce((n, l) => n + Number(l[k] || 0), 0)]));
  }
  function sources(links = []) {
    const m = /* @__PURE__ */ new Map();
    for (const l of links) m.set(l.source, (m.get(l.source) || 0) + Number(l.visits || 0));
    return [...m].map(([source, visits]) => ({ source, visits })).sort((a, b) => b.visits - a.visits || a.source.localeCompare(b.source));
  }
  function topInsight(links = []) {
    const rows = sources(links).filter((r) => r.source !== "direct" && r.visits > 0);
    if (!rows.length) return "\u5224\u5225\u3067\u304D\u305F\u6D41\u5165\u5143\u306F\u307E\u3060\u3042\u308A\u307E\u305B\u3093\u3002\u8A08\u6E2C\u30EA\u30F3\u30AF\u304B\u3089\u60C5\u5831\u3092\u5897\u3084\u3057\u307E\u3057\u3087\u3046\u3002";
    const top = rows.filter((r) => r.visits === rows[0].visits);
    return "\u5224\u5225\u3067\u304D\u305F\u6D41\u5165\u5143\u3067\u6700\u591A\uFF1A" + top.map((r) => media[r.source] || r.source).join("\u30FB") + " " + rows[0].visits + "\u8A2A\u554F" + (top.length > 1 ? "\uFF08\u540C\u7387\uFF09" : "");
  }
  function landings(rows = []) {
    const m = /* @__PURE__ */ new Map();
    for (const r of rows) {
      const p = canonical(r.path);
      m.set(p, (m.get(p) || 0) + Number(r.visits || 0));
    }
    return [...m].map(([path, visits]) => ({ path, visits })).sort((a, b) => b.visits - a.visits);
  }
  function previousPeriod(start, end) {
    const n = (Date.parse(end) - Date.parse(start)) / 864e5 + 1;
    return { start: new Date(Date.parse(start) - n * 864e5).toISOString().slice(0, 10), end: new Date(Date.parse(start) - 864e5).toISOString().slice(0, 10) };
  }
  function comparison(current, prior) {
    if (current.quality?.partial_period || prior.quality?.partial_period) return { available: false, message: "\u8A08\u6E2C\u958B\u59CB\u524D\u3092\u542B\u3080\u305F\u3081\u3001\u524D\u671F\u9593\u6BD4\u306F\u8868\u793A\u3057\u307E\u305B\u3093\u3002" };
    return { available: true, current: totals(current.links), previous: totals(prior.links) };
  }
  function selectArticles(items = [], includeUnpublished = false, sort = "visits") {
    return items.filter((a) => includeUnpublished || ["published", "unknown"].includes(a.status)).sort((a, b) => Number(b[sort] || 0) - Number(a[sort] || 0) || a.title.localeCompare(b.title, "ja"));
  }

  // outputs/studio-analytics-redesign-20261019/src/analytics-ui.mjs
  (() => {
    "use strict";
    const $ = (id) => document.getElementById(id), view = $("view-analytics"), host = view?.querySelector(".page-wrap"), tabs = host?.querySelector(".weekly-tabs");
    if (!tabs || $("analyticsWorkspace")) return;
    const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]), num = (n) => Number(n || 0).toLocaleString("ja-JP"), names = Object.fromEntries(people), apiBase = "/api/totonoe-studio/api";
    const restoreView = new URLSearchParams(location.search).has("a_tab");
    let data = null, prior = null, initiatives = [], role = "", seq = 0, editing = null, saveBusy = false, active = "overview", config = readConfig();
    function today() {
      return new Date(Date.now() + 324e5).toISOString().slice(0, 10);
    }
    function shift(d, n) {
      return new Date(Date.parse(d) + n * 864e5).toISOString().slice(0, 10);
    }
    function readConfig() {
      let x = {};
      try {
        x = JSON.parse(sessionStorage.getItem("studio-analytics-v2") || "{}");
      } catch {
      }
      const q = new URLSearchParams(location.search);
      for (const k of ["start", "end", "owner", "source", "service", "tab"]) if (q.has("a_" + k)) x[k] = q.get("a_" + k);
      return { start: shift(today(), -6), end: today(), owner: "all", source: "all", service: "all", tab: "overview", ...x };
    }
    function remember() {
      config.tab = active;
      sessionStorage.setItem("studio-analytics-v2", JSON.stringify(config));
      if (!view.classList.contains("active") && !restoreView) return;
      const u = new URL(location.href);
      for (const k of ["start", "end", "owner", "source", "service", "tab"]) u.searchParams.set("a_" + k, config[k]);
      history.replaceState(null, "", u);
    }
    async function api(path, options2 = {}) {
      const r = await fetch(apiBase + path, { credentials: "same-origin", cache: "no-store", ...options2, headers: { "content-type": "application/json", ...options2.headers } });
      if (!(r.headers.get("content-type") || "").includes("json")) throw Error("\u30ED\u30B0\u30A4\u30F3\u72B6\u614B\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
      const d = await r.json();
      if (!r.ok) throw Error(d.message || d.error || "\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002");
      return d;
    }
    const linkOwner = (id) => id === "shindo-toshiki" ? "kanto-toshiki" : id, memberOwner = (id) => id === "kanto-toshiki" ? "shindo-toshiki" : id;
    names["shindo-toshiki"] = names["kanto-toshiki"];
    const options = (rows, value) => rows.map(([v, s]) => `<option value="${esc(v)}" ${v === value ? "selected" : ""}>${esc(s)}</option>`).join("");
    const nav = [["overview", "\u6982\u8981"], ["acquisition", "\u6D41\u5165\u3068\u30EA\u30F3\u30AF"], ["content", "\u30B3\u30F3\u30C6\u30F3\u30C4"], ["initiatives", "\u65BD\u7B56\u3068\u632F\u308A\u8FD4\u308A"], ["reports", "\u9031\u6B21\u30EC\u30DD\u30FC\u30C8"]];
    tabs.innerHTML = nav.map(([k, s]) => `<button type="button" data-access-tab="${k}" aria-pressed="false">${s}</button>`).join("");
    host.classList.add("analytics-rebuilt");
    const workspace = document.createElement("div");
    workspace.id = "analyticsWorkspace";
    workspace.innerHTML = `<div class="analytics-command"><details id="anFilters"><summary>\u671F\u9593\u30FB\u62C5\u5F53\u8005\u30FB\u5A92\u4F53\u3067\u7D5E\u308A\u8FBC\u3080</summary><div class="analytics-controls"><label>\u671F\u9593<select id="anRange"><option value="7">\u76F4\u8FD17\u65E5</option><option value="week">\u4ECA\u9031\uFF08\u571F\u66DC\u301C\u4ECA\u65E5\uFF09</option><option value="last">\u5148\u9031\uFF08\u571F\u66DC\u301C\u91D1\u66DC\uFF09</option><option value="30">\u76F4\u8FD130\u65E5</option><option value="custom" selected>\u671F\u9593\u3092\u6307\u5B9A</option></select></label><label>\u958B\u59CB\u65E5<input type="date" id="anStart" value="${esc(config.start)}"></label><label>\u7D42\u4E86\u65E5<input type="date" id="anEnd" value="${esc(config.end)}"></label><label>\u62C5\u5F53\u8005<select id="anOwner">${options([["all", "\u5168\u54E1"], ["", "\u62C5\u5F53\u8005\u4E0D\u660E"], ...people], config.owner)}</select></label><label>\u5A92\u4F53<select id="anSource">${options([["all", "\u3059\u3079\u3066"], ...Object.entries(media)], config.source)}</select></label><label>\u30B5\u30FC\u30D3\u30B9<select id="anService">${options([["all", "\u3059\u3079\u3066"], ["weekly", "TAYORI\u306B\u63A5\u70B9"], ["curriculum", "IROHA\u306B\u63A5\u70B9"]], config.service)}</select></label></div></details><div class="analytics-actions"><button id="anRefresh">\u66F4\u65B0</button><button id="anReset">\u6761\u4EF6\u3092\u89E3\u9664</button><button id="anCsv">\u3053\u306E\u6761\u4EF6\u306ECSV</button><button id="anNew" class="an-primary" disabled>\u65BD\u7B56\u3092\u767B\u9332</button></div><p id="anScope" class="an-scope"></p><p id="anStatus" role="status" aria-live="polite">\u63A5\u7D9A\u3092\u78BA\u8A8D\u3057\u3066\u3044\u307E\u3059\u2026</p></div><div id="anOverview" data-an-pane="overview"></div><div id="anAcquisition" data-an-pane="acquisition" hidden></div><div id="anContent" data-an-pane="content" hidden><section class="an-panel"><h2>\u516C\u958B\u30B3\u30F3\u30C6\u30F3\u30C4\u306E\u53CD\u5FDC</h2><p>PV\u306F\u8868\u793A\u56DE\u6570\u3001\u8A2A\u554F\u306F30\u5206\u5358\u4F4D\u3067\u3059\u3002\u975E\u516C\u958B\u306E0\u4EF6\u306F\u672A\u8A08\u6E2C\u3068\u533A\u5225\u3057\u307E\u3059\u3002</p><div class="analytics-actions"><label><input id="anDrafts" type="checkbox">\u4E0B\u66F8\u304D\u30FB\u30A2\u30FC\u30AB\u30A4\u30D6\u3082\u8868\u793A</label><label>\u4E26\u3073\u9806<select id="anArticleSort"><option value="visits">\u8A2A\u554F\u304C\u591A\u3044\u9806</option><option value="pv">PV\u304C\u591A\u3044\u9806</option><option value="tayori_clicks">TAYORI\u30AF\u30EA\u30C3\u30AF\u9806</option><option value="iroha_clicks">IROHA\u30AF\u30EA\u30C3\u30AF\u9806</option></select></label></div><div id="anArticleTable"></div></section></div><div id="anInitiatives" data-an-pane="initiatives" hidden></div>`;
    tabs.after(workspace);
    function setTab(name) {
      active = nav.some((x) => x[0] === name) ? name : "overview";
      workspace.hidden = active === "reports";
      view.classList.toggle("weekly-archive-mode", active === "reports");
      $("weeklyAccessReports").hidden = active !== "reports";
      workspace.querySelectorAll("[data-an-pane]").forEach((n) => n.hidden = n.dataset.anPane !== active);
      tabs.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.accessTab === active)));
      remember();
    }
    tabs.addEventListener("click", (e) => {
      const b = e.target.closest("[data-access-tab]");
      if (b) setTab(b.dataset.accessTab);
    });
    function scope() {
      return `${config.start}\u301C${config.end}\uFF08\u65E5\u672C\u6642\u9593\uFF09 \uFF0F ${names[config.owner] || (config.owner === "" ? "\u62C5\u5F53\u8005\u4E0D\u660E" : "\u5168\u54E1")} \uFF0F ${media[config.source] || "\u3059\u3079\u3066\u306E\u5A92\u4F53"} \uFF0F ${{ all: "\u3059\u3079\u3066\u306E\u8A2A\u554F", weekly: "TAYORI\u95A2\u9023\u30DA\u30FC\u30B8\u306B\u63A5\u70B9\u306E\u3042\u308B\u8A2A\u554F", curriculum: "IROHA\u95A2\u9023\u30DA\u30FC\u30B8\u306B\u63A5\u70B9\u306E\u3042\u308B\u8A2A\u554F" }[config.service]}`;
    }
    function params(c = config) {
      return new URLSearchParams({ start: c.start, end: c.end, owner: c.owner, source: c.source, service: c.service });
    }
    async function load() {
      const id = ++seq;
      data = null;
      prior = null;
      $("anStatus").textContent = "\u96C6\u8A08\u3092\u53D6\u5F97\u3057\u3066\u3044\u307E\u3059\u2026";
      $("anRefresh").disabled = true;
      ["anOverview", "anAcquisition", "anInitiatives", "anArticleTable"].forEach((k) => $(k).innerHTML = "");
      $("anScope").textContent = scope();
      remember();
      try {
        const current = await api("/analytics-summary?" + params());
        if (id !== seq) return;
        data = current;
        render();
        const previous = previousPeriod(config.start, config.end);
        const results = await Promise.allSettled([api("/analytics-summary?" + params({ ...config, ...previous })), api("/analytics-initiatives?" + new URLSearchParams({ start: config.start, end: config.end }))]);
        if (id !== seq) return;
        prior = results[0].status === "fulfilled" ? results[0].value : null;
        initiatives = results[1].status === "fulfilled" ? results[1].value.initiatives : [];
        render();
        $("anStatus").textContent = `\u66F4\u65B0 ${new Date(data.generated_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })} \uFF0F \u6210\u679C\u306E\u89B3\u6E2C\u6642\u70B9 ${new Date(data.outcomes_as_of).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}` + (results.some((r) => r.status === "rejected") ? " \uFF0F \u524D\u671F\u9593\u307E\u305F\u306F\u65BD\u7B56\u3092\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002\u66F4\u65B0\u3067\u518D\u8A66\u884C\u3067\u304D\u307E\u3059\u3002" : "");
      } catch (e) {
        if (id !== seq) return;
        data = null;
        $("anStatus").textContent = "\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\uFF1A" + e.message;
        ["anOverview", "anAcquisition", "anInitiatives"].forEach((k) => $(k).innerHTML = '<p class="an-panel">\u6570\u5B57\u3092\u8868\u793A\u3067\u304D\u307E\u305B\u3093\u3002\u66F4\u65B0\u3057\u3066\u518D\u8A66\u884C\u3057\u3066\u304F\u3060\u3055\u3044\u3002</p>');
      } finally {
        if (id === seq) $("anRefresh").disabled = false;
      }
    }
    function bars(rows, label, limit = 10) {
      const max = Math.max(1, ...rows.map((r) => r.visits));
      return rows.slice(0, limit).map((r) => `<div class="an-bar"><span>${esc(label(r))}</span><meter min="0" max="${max}" value="${r.visits}" aria-label="${esc(label(r))} ${r.visits}\u8A2A\u554F"></meter><b>${num(r.visits)}</b></div>`).join("") || "<p>\u3053\u306E\u6761\u4EF6\u306E\u8A2A\u554F\u306F\u3042\u308A\u307E\u305B\u3093\u3002</p>";
    }
    function render() {
      if (!data) return;
      const total = totals(data.links), rows = sources(data.links), unknown = rows.find((r) => r.source === "direct")?.visits || 0, known = total.visits - unknown, ratio = total.visits ? (known / total.visits * 100).toFixed(1) : null, comp = prior ? comparison(data, prior) : { available: false, message: "\u524D\u671F\u9593\u3092\u78BA\u8A8D\u4E2D\u3001\u307E\u305F\u306F\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093\u3002" };
      const metrics = [["\u8A2A\u554F", "visits", "\u518D\u8A2A\u3092\u542B\u3080\u30FB\u4EBA\u6570\u3067\u306F\u3042\u308A\u307E\u305B\u3093"], ["\u7533\u8FBC\u958B\u59CB", "checkout_sessions", "Checkout\u3092\u958B\u59CB\u3057\u305F\u8A2A\u554F"], ["\u5951\u7D04", "completed_sessions", "\u7121\u6599\u3092\u542B\u3080\u5B8C\u4E86\u6E08\u307F\u5951\u7D04\u306E\u8A2A\u554F"], ["\u7D99\u7D9A\u8AB2\u91D1", "recurring_sessions", "\u6B63\u306E\u7D99\u7D9A\u8ACB\u6C42\u304C\u3042\u3063\u305F\u8A2A\u554F"]];
      $("anOverview").innerHTML = `<div class="an-kpis">${metrics.map(([s, k, n]) => `<article><h2>${s}</h2><strong data-an-metric="${k}">${num(total[k])}</strong><small>${n}</small><span>${comp.available ? `\u524D\u671F\u9593 ${num(comp.previous[k])} \uFF0F \u5DEE ${total[k] - comp.previous[k] >= 0 ? "+" : ""}${num(total[k] - comp.previous[k])}` : "\u524D\u671F\u9593\u6BD4 \u2014"}</span></article>`).join("")}</div><p class="an-insight">${esc(topInsight(data.links))}</p><p class="an-note">\u5404\u6307\u6A19\u306F\u72EC\u7ACB\u3057\u305F\u96C6\u8A08\u3067\u3059\u3002\u7533\u8FBC\u30EA\u30F3\u30AF\u3092\u7D4C\u7531\u3057\u306A\u3044\u7533\u8FBC\u3082\u3042\u308B\u305F\u3081\u3001\u9806\u756A\u306B\u6E1B\u308B\u6F0F\u6597\u3067\u306F\u3042\u308A\u307E\u305B\u3093\u3002${comp.available ? "\u6BD4\u8F03\u671F\u9593 " + prior.filters.start + "\u301C" + prior.filters.end + "\u3002" : esc(comp.message)}</p><div class="an-columns"><section class="an-panel"><h2>\u65E5\u5225\u306E\u8A2A\u554F\uFF08\u6700\u592714\u65E5\uFF09</h2>${bars(data.daily.slice(-14), (r) => r.date, 14)}<details><summary>\u3059\u3079\u3066\u306E\u65E5\u5225\u6570\u5024</summary>${data.daily.map((r) => `<p>${esc(r.date)}\uFF1A${num(r.visits)}\u8A2A\u554F</p>`).join("")}</details></section><section class="an-panel"><h2>\u6D41\u5165\u5143\u306E\u5185\u8A33</h2>${bars(rows, (r) => media[r.source] || r.source)}<button data-an-go="acquisition">\u30EA\u30F3\u30AF\u5225\u306B\u78BA\u8A8D</button></section></div><section class="an-panel an-quality"><h2>\u6570\u5B57\u306E\u78BA\u304B\u3055</h2><p><b>\u6D41\u5165\u5143\u3092\u5224\u5225\u3067\u304D\u305F\u8A2A\u554F ${num(known)} / ${num(total.visits)} ${ratio === null ? "\uFF08\u6BCD\u6570\u306A\u3057\uFF09" : "\uFF08" + ratio + "%\uFF09"}</b> \uFF0F \u76F4\u63A5\u30FB\u5224\u5225\u4E0D\u80FD ${num(unknown)}\u8A2A\u554F</p><p>\u8A08\u6E2C\u958B\u59CB ${new Date(data.measurement_started_at).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })}${data.quality.partial_period ? " \uFF0F \u9078\u629E\u671F\u9593\u306E\u4E00\u90E8\u3060\u3051\u3092\u8A08\u6E2C\u3057\u3066\u3044\u307E\u3059" : ""}\u3002\u4E0D\u660E\u306A\u6D41\u5165\u5143\u306F\u63A8\u6E2C\u3067\u88DC\u3044\u307E\u305B\u3093\u3002</p><details><summary>\u6570\u5024\u306E\u5B9A\u7FA9\u30FB\u9664\u5916\u6761\u4EF6</summary><p>\u8A2A\u554F\u306F30\u5206\u7121\u64CD\u4F5C\u3067\u7D42\u4E86\u3002\u540C\u3058\u4EBA\u306E\u518D\u8A2A\u3092\u542B\u307F\u3001\u5225\u7AEF\u672B\u3092\u8FFD\u8DE1\u3057\u307E\u305B\u3093\u3002\u7533\u8FBC\u30FB\u5951\u7D04\u306E\u7387\u3092\u793A\u3059\u5834\u5408\u306E\u6BCD\u6570\u306F\u3001\u3053\u306E\u6761\u4EF6\u306E\u8A2A\u554F\u3067\u3059\u3002\u6210\u679C\u306F\u5BFE\u8C61\u671F\u9593\u306E\u8A2A\u554F\u306B\u95A2\u9023\u3059\u308B\u3082\u306E\u3092\u3001\u4E0A\u306E\u89B3\u6E2C\u6642\u70B9\u307E\u3067\u96C6\u8A08\u3057\u307E\u3059\u3002</p><p>Studio\u306E\u5185\u90E8\u5229\u7528\u3068\u8B58\u5225\u6E08\u307FBot\u3092\u9664\u5916\u3002\u672A\u8B58\u5225\u306E\u81EA\u52D5\u64CD\u4F5C\u304C\u6B8B\u308B\u53EF\u80FD\u6027\u304C\u3042\u308A\u307E\u3059\u3002\u30B5\u30FC\u30D3\u30B9\u6761\u4EF6\u306F\u3001\u305D\u306E\u95A2\u9023\u30DA\u30FC\u30B8\u3092\u898B\u305F\u30FB\u30EA\u30F3\u30AF\u64CD\u4F5C\u3092\u3057\u305F\u8A2A\u554F\u3067\u3059\u3002\u4F1A\u54E1\u8CC7\u683C\u3092\u8868\u3059\u3082\u306E\u3067\u306F\u3042\u308A\u307E\u305B\u3093\u3002</p><p>\u5206\u6790\u7528JSON\u306F\u540C\u3058\u671F\u9593\u306E\u5168\u4F53\u96C6\u8A08\u3067\u3059\u3002\u62C5\u5F53\u8005\u30FB\u5A92\u4F53\u30FB\u30B5\u30FC\u30D3\u30B9\u306E\u7D5E\u308A\u8FBC\u307F\u306F\u9069\u7528\u3057\u307E\u305B\u3093\u3002\u6307\u6A19\u5B9A\u7FA9\u30FB\u89B3\u6E2C\u6642\u70B9\u3092\u542B\u307F\u3001\u4F1A\u54E1\u306E\u6C0F\u540D\u3084\u56DE\u7B54\u672C\u6587\u306F\u542B\u3081\u307E\u305B\u3093\u3002</p><button data-an-export-json>\u671F\u9593\u5168\u4F53\u306E\u533F\u540DJSON</button></details></section>`;
      $("anAcquisition").innerHTML = `<section class="an-panel"><div class="an-panel-head"><h2>\u3069\u306E\u30EA\u30F3\u30AF\u304B\u3089\u3001\u3069\u308C\u3060\u3051\u6765\u305F\u304B</h2><button id="anMakeLink" class="an-primary">\u8A08\u6E2C\u30EA\u30F3\u30AF\u3092\u4F5C\u6210</button></div><p>\u73FE\u5728\u306E\u6761\u4EF6\u306B\u4E00\u81F4\u3059\u308B ${num(total.visits)}\u8A2A\u554F\u3002\u62C5\u5F53\u8005\u540D\u306F\u30EA\u30F3\u30AF\u306E\u767A\u884C\u5143\u3092\u793A\u3057\u3001\u8A2A\u554F\u8005\u306E\u6C0F\u540D\u3067\u306F\u3042\u308A\u307E\u305B\u3093\u3002</p><div class="an-scroll"><table><thead><tr><th>\u62C5\u5F53\u8005\u30FB\u6295\u7A3F\u30AD\u30FC</th><th>\u5A92\u4F53</th><th>\u8A2A\u554F</th><th>\u69CB\u6210\u6BD4</th><th>\u7533\u8FBC\u958B\u59CB</th><th>\u5951\u7D04\uFF08\u7121\u6599\u542B\u3080\uFF09</th></tr></thead><tbody>${data.links.slice().sort((a, b) => b.visits - a.visits).map((l) => `<tr><td>${esc(names[l.owner] || "\u62C5\u5F53\u8005\u4E0D\u660E")}<small>${esc(l.link_key || "\u8A08\u6E2C\u30AD\u30FC\u306A\u3057")}</small></td><td>${esc(media[l.source] || l.source)}</td><td>${num(l.visits)}</td><td>${total.visits ? (l.visits / total.visits * 100).toFixed(1) + "%" : "\u2014"}</td><td>${num(l.checkout_sessions)}</td><td>${num(l.completed_sessions)}</td></tr>`).join("") || '<tr><td colspan="6">\u8A72\u5F53\u3059\u308B\u8A2A\u554F\u306F\u3042\u308A\u307E\u305B\u3093\u3002</td></tr>'}</tbody><tfoot><tr><th colspan="2">\u5408\u8A08</th><td>${num(total.visits)}</td><td>${total.visits ? "100%" : "\u2014"}</td><td>${num(total.checkout_sessions)}</td><td>${num(total.completed_sessions)}</td></tr></tfoot></table></div><p>\u5143\u306E\u6295\u7A3FURL\u306F\u3001\u65BD\u7B56\u306B\u767B\u9332\u3057\u305F\u5834\u5408\u306B\u78BA\u8A8D\u3067\u304D\u307E\u3059\u3002\u8A08\u6E2C\u30AD\u30FC\u306E\u306A\u3044\u904E\u53BB\u306E\u6D41\u5165\u306F\u5FA9\u5143\u3067\u304D\u307E\u305B\u3093\u3002</p></section><section class="an-panel"><h2>\u5165\u53E3\u30DA\u30FC\u30B8</h2><p>\u78BA\u8A8D\u6E08\u307F\u306E\u65E7URL\u3068\u6B63\u5F0FURL\u3092\u307E\u3068\u3081\u3066\u8868\u793A\u3057\u307E\u3059\u3002\u5143\u306E\u8A18\u9332\u306F\u4FDD\u6301\u3057\u307E\u3059\u3002</p>${bars(landings(data.landings), (r) => pageName(r.path))}<details><summary>\u78BA\u8A8D\u3067\u304D\u305F\u30DA\u30FC\u30B8\u9593\u306E\u79FB\u52D5</summary>${(data.journeys || []).filter((j) => j.from_path !== j.to_path).slice().sort((a, b) => b.count - a.count).slice(0, 15).map((j) => `<p>${esc(pageName(j.from_path))} \u2192 ${esc(pageName(j.to_path))}\uFF1A${num(j.count)}\u56DE</p>`).join("") || "<p>\u3053\u306E\u6761\u4EF6\u306E\u8A18\u9332\u306F\u3042\u308A\u307E\u305B\u3093\u3002</p>"}</details></section>`;
      $("anMakeLink").onclick = openLink;
      renderArticles();
      renderInitiatives();
    }
    function renderArticles() {
      if (!data) return;
      const rows = selectArticles(data.articles, $("anDrafts").checked, $("anArticleSort").value);
      $("anArticleTable").innerHTML = `<div class="an-note">\u52D5\u753B\u3092\u958B\u3044\u305F\u8A2A\u554F ${num(data.links.reduce((n, l) => n + Number(l.video_sessions || 0), 0))} \uFF0F \u76F8\u8AC7\u30EA\u30F3\u30AF\u3092\u62BC\u3057\u305F\u8A2A\u554F ${num(data.links.reduce((n, l) => n + Number(l.consultation_sessions || 0), 0))}\u3002\u5B9F\u8996\u8074\u30FB\u76F8\u8AC7\u5B8C\u4E86\u3068\u306F\u7570\u306A\u308A\u307E\u3059\u3002</div><p>${rows.length}\u4EF6 \uFF0F \u6761\u4EF6\u306F\u753B\u9762\u4E0A\u90E8\u3068\u5171\u901A\u3067\u3059\u3002\u8A18\u4E8B\u306E\u8A2A\u554F\u306F\u95B2\u89A7\u3057\u305F\u8A18\u4E8B\u3054\u3068\u306B\u6570\u3048\u308B\u305F\u3081\u3001\u884C\u306E\u5408\u8A08\u306F\u30B5\u30A4\u30C8\u5168\u4F53\u306E\u8A2A\u554F\u3068\u306F\u4E00\u81F4\u3057\u307E\u305B\u3093\u3002</p><div class="an-scroll"><table><thead><tr><th>\u8A18\u4E8B</th><th>PV</th><th>\u8A2A\u554F</th><th>TAYORI\u30AF\u30EA\u30C3\u30AF</th><th>IROHA\u30AF\u30EA\u30C3\u30AF</th></tr></thead><tbody>${rows.slice(0, articleLimit).map((a) => `<tr><td><details><summary>${esc(a.title)}</summary><p>${esc(a.status === "published" ? "\u516C\u958B\u4E2D" : a.status === "unknown" ? "\u65E2\u5B58\u516C\u958B\u8A18\u4E8B" : "\u672A\u516C\u958B\u30FB\u30A2\u30FC\u30AB\u30A4\u30D6")} \uFF0F ${esc(a.observed_path || a.path)}</p>${(a.sources || []).map((s) => `<p>${esc(media[s.source] || s.source)}\uFF1A${num(s.visits)}\u8A2A\u554F</p>`).join("")}</details></td>${["pv", "visits", "tayori_clicks", "iroha_clicks"].map((k) => `<td>${!["published", "unknown"].includes(a.status) && !a.pv ? "\u672A\u8A08\u6E2C" : num(a[k])}</td>`).join("")}</tr>`).join("") || '<tr><td colspan="5">\u516C\u958B\u8A18\u4E8B\u306E\u8A72\u5F53\u30C7\u30FC\u30BF\u306F\u3042\u308A\u307E\u305B\u3093\u3002</td></tr>'}</tbody></table></div>${rows.length > articleLimit ? '<button id="anMoreArticles">\u3055\u3089\u306B10\u4EF6\u8868\u793A</button>' : ""}`;
      if ($("anMoreArticles")) $("anMoreArticles").onclick = () => {
        articleLimit += 10;
        renderArticles();
      };
    }
    let articleLimit = 10;
    $("anDrafts").onchange = () => {
      articleLimit = 10;
      renderArticles();
    };
    $("anArticleSort").onchange = renderArticles;
    function matchingInitiatives() {
      return initiatives.filter((i) => (config.owner === "all" || linkOwner(i.primary_owner_id) === config.owner || (i.collaborator_ids || []).map(linkOwner).includes(config.owner)) && (config.source === "all" || i.channel === config.source || (i.measurement_links || []).some((l) => l.source === config.source)) && (config.service === "all" || i.target_plan === config.service));
    }
    function renderInitiatives() {
      if (!data) return;
      const list = matchingInitiatives().slice().sort((a, b) => (a.result_status === "pending" ? 0 : 1) - (b.result_status === "pending" ? 0 : 1) || b.occurred_on.localeCompare(a.occurred_on));
      $("anInitiatives").innerHTML = `<section class="an-panel"><div class="an-panel-head"><h2>\u65BD\u7B56\u3068\u632F\u308A\u8FD4\u308A</h2><button id="anAddInitiative" ${["admin", "editor"].includes(role) ? "" : "disabled"}>\u65BD\u7B56\u3092\u767B\u9332</button></div><p>\u76EE\u7684\u30FB\u4EEE\u8AAC\u3092\u7ACB\u3066\u3001\u5C02\u7528\u30EA\u30F3\u30AF\u3067\u7D50\u679C\u3092\u78BA\u8A8D\u3057\u3001\u5B66\u3073\u3092\u6B21\u306E\u884C\u52D5\u3078\u3064\u306A\u3052\u307E\u3059\u3002\u524D\u5F8C\u306E\u5897\u6E1B\u3060\u3051\u3067\u65BD\u7B56\u306E\u52B9\u679C\u3068\u306F\u65AD\u5B9A\u3057\u307E\u305B\u3093\u3002</p>${list.map((i) => {
        const links = data.links.filter((g) => (i.measurement_links || []).some((l) => l.source === g.source && l.link_key === g.link_key)), t = totals(links);
        return `<article class="an-initiative"><div class="an-panel-head"><h3>${esc(i.title)}</h3><button data-an-edit="${esc(i.id)}">${["admin", "editor"].includes(role) ? "\u7DE8\u96C6\u30FB\u632F\u308A\u8FD4\u308A" : "\u5185\u5BB9\u3092\u78BA\u8A8D"}</button></div><p>${esc(i.occurred_on)} \uFF0F ${esc(names[i.primary_owner_id] || "")} \uFF0F ${esc({ website: "Web\u30B5\u30A4\u30C8", email: "\u30E1\u30FC\u30EB", event: "\u30A4\u30D9\u30F3\u30C8", ai: "AI", other: "\u305D\u306E\u4ED6" }[i.channel] || media[i.channel] || i.channel)} \uFF0F ${i.result_status === "pending" ? "\u672A\u632F\u308A\u8FD4\u308A" : esc({ success: "\u6210\u529F", partial: "\u4E00\u90E8\u6210\u529F", improve: "\u6539\u5584\u3057\u3066\u7D99\u7D9A", hold: "\u4FDD\u7559" }[i.result_status] || i.result_status)}</p><p>\u76EE\u7684\uFF1A${esc(i.objective || "\u672A\u5165\u529B")}<br>\u4EEE\u8AAC\uFF1A${esc(i.hypothesis || "\u672A\u5165\u529B")}</p><p>${i.measurement_links?.length ? `\u3053\u306E\u6761\u4EF6\u306E\u5C02\u7528\u30EA\u30F3\u30AF\u5B9F\u7E3E\uFF1A${num(t.visits)}\u8A2A\u554F \uFF0F \u7533\u8FBC\u958B\u59CB ${num(t.checkout_sessions)} \uFF0F \u5951\u7D04 ${num(t.completed_sessions)}` : "\u8A08\u6E2C\u30EA\u30F3\u30AF\u304C\u672A\u767B\u9332\u3067\u3059\u3002\u6D41\u5165\u3068\u306E\u5BFE\u5FDC\u306F\u307E\u3060\u78BA\u8A8D\u3067\u304D\u307E\u305B\u3093\u3002"}</p><p>\u5B66\u3073\uFF1A${esc(i.learning || "\u672A\u5165\u529B")}<br>\u6B21\u306E\u884C\u52D5\uFF1A${esc(i.next_action || "\u672A\u5165\u529B")}</p>${i.reference_url ? `<a href="${esc(i.reference_url)}" target="_blank" rel="noopener">\u6295\u7A3F\u30FB\u53C2\u8003URL\u3092\u958B\u304F</a>` : ""}</article>`;
      }).join("") || '<p class="an-empty">\u3053\u306E\u6761\u4EF6\u306E\u65BD\u7B56\u306F\u307E\u3060\u3042\u308A\u307E\u305B\u3093\u3002\u300C\u65BD\u7B56\u3092\u767B\u9332\u300D\u304B\u3089\u59CB\u3081\u3089\u308C\u307E\u3059\u3002</p>'}</section>`;
      $("anAddInitiative").onclick = () => openInitiative();
    }
    const fields = [["title", "\u65BD\u7B56\u540D"], ["occurred_on", "\u5B9F\u65BD\u65E5", "date"], ["channel", "\u5A92\u4F53", "channel"], ["initiative_type", "\u65BD\u7B56\u306E\u7A2E\u985E", "kind"], ["primary_owner_id", "\u4E3B\u62C5\u5F53\u8005", "person"], ["destination_path", "\u8A98\u5C0E\u5148\u30D1\u30B9"], ["objective", "\u76EE\u7684", "area"], ["hypothesis", "\u4EEE\u8AAC", "area"], ["reference_url", "\u6295\u7A3F\u30FB\u53C2\u8003URL", "url"], ["measurement_links", "\u5C02\u7528\u30EA\u30F3\u30AF\uFF081\u884C\u306B1\u3064\uFF09", "area"], ["target_plan", "\u5BFE\u8C61\u30B5\u30FC\u30D3\u30B9", "plan"], ["target_metric", "\u76EE\u6A19\u6307\u6A19", "metric"], ["target_value", "\u76EE\u6A19\u5024\uFF08\u4EFB\u610F\uFF09", "number"], ["result_status", "\u632F\u308A\u8FD4\u308A", "result"], ["learning", "\u5B66\u3073", "area"], ["next_action", "\u6B21\u306E\u884C\u52D5", "area"]];
    const dialog = document.createElement("dialog");
    dialog.id = "anDialog";
    dialog.innerHTML = '<form id="anForm"><div class="an-panel-head"><h2 id="anDialogTitle">\u65BD\u7B56\u3092\u767B\u9332</h2><button type="button" id="anClose" aria-label="\u65BD\u7B56\u306E\u5165\u529B\u3092\u9589\u3058\u308B">\u9589\u3058\u308B</button></div><div id="anFormFields"></div><p id="anSaveStatus" role="status"></p><div class="an-dialog-footer"><button type="submit" id="anSave" class="an-primary">\u5171\u6709\u4FDD\u5B58</button></div></form>';
    document.body.appendChild(dialog);
    $("anClose").onclick = () => dialog.close();
    function openInitiative(item = null, prefill = null) {
      editing = item;
      const base = { title: "", occurred_on: today(), channel: "instagram", primary_owner_id: people[0][0], destination_path: "/projects/totonoe/", initiative_type: "social_post", result_status: "pending", target_plan: "all", target_metric: "visits", ...item, ...prefill };
      base.primary_owner_id = linkOwner(base.primary_owner_id);
      $("anDialogTitle").textContent = item ? "\u65BD\u7B56\u306E\u7DE8\u96C6\u30FB\u632F\u308A\u8FD4\u308A" : "\u65BD\u7B56\u3092\u767B\u9332";
      $("anFormFields").innerHTML = fields.map(([key, label, type]) => {
        let value = base[key] ?? "", control;
        if (key === "measurement_links") value = (base.measurement_links || []).map((l) => `${l.source}|${l.link_key}`).join("\n");
        let rows = type === "kind" ? [["social_post", "SNS\u6295\u7A3F"], ["article", "\u8A18\u4E8B\u516C\u958B"], ["video", "\u52D5\u753B\u516C\u958B"], ["email", "\u30E1\u30FC\u30EB\u914D\u4FE1"], ["event", "\u30A4\u30D9\u30F3\u30C8"], ["site_update", "\u30B5\u30A4\u30C8\u6539\u4FEE"], ["advertising", "\u5E83\u544A"], ["other", "\u305D\u306E\u4ED6"]] : type === "channel" ? Object.entries(media).filter(([v]) => !["direct"].includes(v) && !v.startsWith("ai_") && !v.startsWith("search_")).concat([["email", "\u30E1\u30FC\u30EB"], ["event", "\u30A4\u30D9\u30F3\u30C8"], ["website", "Web\u30B5\u30A4\u30C8"], ["ai", "AI"], ["other", "\u305D\u306E\u4ED6"]]) : type === "person" ? people : type === "plan" ? [["all", "\u3059\u3079\u3066"], ["weekly", "TAYORI"], ["curriculum", "IROHA"]] : type === "metric" ? [["visits", "\u8A2A\u554F"], ["waitlist", "\u5F85\u6A5F\u767B\u9332"], ["contracts", "\u5951\u7D04"], ["recurring", "\u7D99\u7D9A\u8AB2\u91D1"]] : type === "result" ? [["pending", "\u672A\u632F\u308A\u8FD4\u308A"], ["success", "\u6210\u529F"], ["partial", "\u4E00\u90E8\u6210\u529F"], ["improve", "\u6539\u5584\u3057\u3066\u7D99\u7D9A"], ["hold", "\u4FDD\u7559"]] : null;
        control = rows ? `<select name="${key}">${options(rows, value)}</select>` : type === "area" ? `<textarea name="${key}" rows="3">${esc(value)}</textarea>` : `<input name="${key}" type="${type || "text"}" value="${esc(value)}" ${["title", "occurred_on"].includes(key) ? "required" : ""} ${type === "number" ? 'min="0" step="1"' : ""}>`;
        return `<label>${label}${control}</label>`;
      }).join("");
      for (const [title, keys, open] of [["\u76EE\u7684\u30FB\u8A08\u6E2C\u30EA\u30F3\u30AF\u30FB\u76EE\u6A19", ["objective", "hypothesis", "reference_url", "measurement_links", "target_plan", "target_metric", "target_value"], false], ["\u7D50\u679C\u3092\u632F\u308A\u8FD4\u308B", ["result_status", "learning", "next_action"], !!item]]) {
        const d = document.createElement("details"), summary = document.createElement("summary");
        summary.textContent = title;
        d.appendChild(summary);
        d.open = open;
        for (const key of keys) {
          const field = $("anFormFields").querySelector('[name="' + key + '"]');
          if (field) d.appendChild(field.closest("label"));
        }
        $("anFormFields").appendChild(d);
      }
      const can = ["admin", "editor"].includes(role);
      $("anFormFields").querySelectorAll("input,textarea,select").forEach((n) => n.disabled = !can);
      $("anSave").disabled = !can;
      $("anSaveStatus").textContent = "\u5B9F\u7E3E\u306E\u6570\u5024\u306F\u66F8\u304D\u63DB\u3048\u305A\u3001\u65BD\u7B56\u306E\u60C5\u5831\u3060\u3051\u3092\u5171\u6709\u4FDD\u5B58\u3057\u307E\u3059\u3002";
      dialog.showModal();
    }
    $("anForm").onsubmit = async (e) => {
      e.preventDefault();
      if (saveBusy || !["admin", "editor"].includes(role)) return;
      try {
        const values = Object.fromEntries(new FormData(e.target)), links = values.measurement_links.trim().split("\n").filter(Boolean).map((l) => {
          if (l.includes("|")) {
            const [source, link_key] = l.trim().split("|");
            return { source, link_key };
          }
          const u = new URL(l);
          if (u.origin !== location.origin || u.searchParams.get("utm_campaign") !== "totonoe_team") throw Error("\u5C02\u7528\u306E\u8A08\u6E2CURL\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
          return { source: u.searchParams.get("utm_source"), link_key: u.searchParams.get("utm_content") };
        });
        saveBusy = true;
        $("anSave").disabled = true;
        try {
          const payload = { ...editing || {}, ...values, primary_owner_id: memberOwner(values.primary_owner_id), measurement_links: links, initiative_type: values.initiative_type || editing?.initiative_type || "social_post", collaborator_ids: editing?.collaborator_ids || [], notes: editing?.notes || "", cost_yen: editing?.cost_yen ?? null, work_minutes: editing?.work_minutes ?? null };
          const result = await api("/analytics-initiatives" + (editing ? "/" + encodeURIComponent(editing.id) : ""), { method: editing ? "PATCH" : "POST", body: JSON.stringify(payload) });
          editing = result.initiative;
          await load();
          $("anSaveStatus").textContent = "\u5171\u6709\u4FDD\u5B58\u3057\u307E\u3057\u305F\u3002\u518D\u8AAD\u307F\u8FBC\u307F\u5F8C\u3082\u78BA\u8A8D\u3067\u304D\u307E\u3059\u3002";
        } catch (error) {
          $("anSaveStatus").textContent = "\u4FDD\u5B58\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\uFF1A" + error.message;
        } finally {
          saveBusy = false;
          $("anSave").disabled = false;
        }
      } catch (error) {
        $("anSaveStatus").textContent = "\u5165\u529B\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\uFF1A" + error.message;
      }
    };
    const linkDialog = document.createElement("dialog");
    linkDialog.id = "anLinkDialog";
    linkDialog.innerHTML = `<div class="an-panel-head"><h2>\u6295\u7A3F\u3054\u3068\u306E\u8A08\u6E2C\u30EA\u30F3\u30AF</h2><button id="anLinkClose" aria-label="\u30EA\u30F3\u30AF\u4F5C\u6210\u3092\u9589\u3058\u308B">\u9589\u3058\u308B</button></div><label>\u62C5\u5F53\u8005<select id="anLinkOwner">${options(people, config.owner === "all" ? people[0][0] : config.owner)}</select></label><label>\u5A92\u4F53<select id="anLinkSource">${options(Object.entries(media).filter(([v]) => !["direct"].includes(v) && !v.startsWith("ai_") && !v.startsWith("search_")), "instagram")}</select></label><label>\u6848\u5185\u5148<select id="anLinkDest">${options([["/projects/totonoe/", "ToToNoE+ \u30C8\u30C3\u30D7"], ["/projects/totonoe/tayori", "TAYORI"], ["/projects/totonoe/IROHA/index.html", "IROHA"], ["/projects/totonoe/tsuzuri/", "\u3064\u3065\u308A\u4E00\u89A7"]], "\uFF0F")}</select></label><label>\u6295\u7A3F\u30FB\u8A2D\u7F6E\u5834\u6240\u306E\u540D\u524D<input id="anLinkTitle" placeholder="\u4F8B\uFF1A10/24\u306EInstagram\u6295\u7A3F"></label><label>\u767A\u884C\u3057\u305FURL<input id="anLinkUrl" readonly></label><p>\u6295\u7A3F\u3054\u3068\u306B\u7570\u306A\u308B\u30AD\u30FC\u3092\u81EA\u52D5\u767A\u884C\u3057\u307E\u3059\u3002\u6C0F\u540D\u30FB\u30E1\u30FC\u30EB\u7B49\u306E\u500B\u4EBA\u60C5\u5831\u306F\u30AD\u30FC\u306B\u5165\u308C\u307E\u305B\u3093\u3002</p><div class="analytics-actions"><button id="anCopyLink">URL\u3092\u30B3\u30D4\u30FC</button><button id="anUseLink" class="an-primary">\u3053\u306E\u30EA\u30F3\u30AF\u3067\u65BD\u7B56\u3092\u767B\u9332</button></div><p id="anLinkStatus" role="status"></p>`;
    document.body.appendChild(linkDialog);
    let linkKey = "";
    function newLink() {
      linkKey = $("anLinkOwner").value + "_" + Date.now().toString(36) + "_" + crypto.randomUUID().slice(0, 8);
      const u = new URL($("anLinkDest").value, location.origin);
      u.search = new URLSearchParams({ utm_source: $("anLinkSource").value, utm_medium: "social", utm_campaign: "totonoe_team", utm_content: linkKey });
      $("anLinkUrl").value = u.href;
    }
    function openLink() {
      newLink();
      $("anLinkStatus").textContent = "\u30B3\u30D4\u30FC\u3057\u305FURL\u3092\u5B9F\u969B\u306E\u6295\u7A3F\u3084\u30D7\u30ED\u30D5\u30A3\u30FC\u30EB\u306B\u8CBC\u308A\u4ED8\u3051\u3066\u304F\u3060\u3055\u3044\u3002";
      linkDialog.showModal();
    }
    $("anLinkClose").onclick = () => linkDialog.close();
    ["anLinkOwner", "anLinkSource", "anLinkDest"].forEach((id) => $(id).onchange = newLink);
    $("anCopyLink").onclick = async () => {
      try {
        await navigator.clipboard.writeText($("anLinkUrl").value);
        $("anLinkStatus").textContent = "\u30B3\u30D4\u30FC\u3057\u307E\u3057\u305F\u3002";
      } catch {
        $("anLinkUrl").select();
        $("anLinkStatus").textContent = "URL\u3092\u9078\u629E\u3057\u307E\u3057\u305F\u3002\u7AEF\u672B\u306E\u30B3\u30D4\u30FC\u64CD\u4F5C\u3092\u4F7F\u3063\u3066\u304F\u3060\u3055\u3044\u3002";
      }
    };
    $("anUseLink").onclick = () => {
      if (!["admin", "editor"].includes(role)) return;
      linkDialog.close();
      openInitiative(null, { title: $("anLinkTitle").value, primary_owner_id: $("anLinkOwner").value, channel: $("anLinkSource").value, destination_path: $("anLinkDest").value, measurement_links: [{ source: $("anLinkSource").value, link_key: linkKey }] });
    };
    function apply() {
      config = { ...config, start: $("anStart").value, end: $("anEnd").value, owner: $("anOwner").value, source: $("anSource").value, service: $("anService").value };
      load();
    }
    ["anStart", "anEnd", "anOwner", "anSource", "anService"].forEach((id) => $(id).onchange = apply);
    $("anRange").onchange = () => {
      const r = $("anRange").value, t = today(), sat = shift(t, -(((/* @__PURE__ */ new Date(t + "T00:00:00Z")).getUTCDay() + 1) % 7));
      if (r === "custom") return;
      $("anEnd").value = r === "last" ? shift(sat, -1) : t;
      $("anStart").value = r === "last" ? shift(sat, -7) : r === "week" ? sat : shift(t, 1 - Number(r));
      apply();
    };
    $("anRefresh").onclick = apply;
    $("anReset").onclick = () => {
      $("anOwner").value = "all";
      $("anSource").value = "all";
      $("anService").value = "all";
      apply();
    };
    $("anNew").onclick = () => openInitiative();
    workspace.addEventListener("click", (e) => {
      if (e.target.closest("[data-an-export-json]")) exportJson();
      const go = e.target.closest("[data-an-go]"), edit = e.target.closest("[data-an-edit]");
      if (go) tabs.querySelector(`[data-access-tab="${go.dataset.anGo}"]`).click();
      if (edit) openInitiative(initiatives.find((i) => i.id === edit.dataset.anEdit));
    });
    async function exportJson() {
      try {
        const d = await api("/analysis-export?" + new URLSearchParams({ start: config.start, end: config.end }));
        const u = URL.createObjectURL(new Blob([JSON.stringify(d, null, 2)], { type: "application/json" })), a = document.createElement("a");
        a.href = u;
        a.download = "access-period-" + config.start + ".json";
        a.click();
        setTimeout(() => URL.revokeObjectURL(u), 1e3);
      } catch (e) {
        $("anStatus").textContent = "\u5206\u6790\u7528JSON\u3092\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093\uFF1A" + e.message;
      }
    }
    $("anCsv").onclick = () => {
      if (!data) return;
      const keys = ["owner", "source", "link_key", "visits", "checkout_sessions", "completed_sessions", "recurring_sessions"], cell = (v) => '"' + String(v ?? "").replace(/^[=+@-]/, "'$&").replace(/"/g, '""') + '"', rows = [["schema_version", "time_zone", "start", "end", "service", "owner_filter", "source_filter", "observed_at", ...keys], ...data.links.map((l) => ["2", "Asia/Tokyo", config.start, config.end, config.service, config.owner, config.source, data.outcomes_as_of, ...keys.map((k) => l[k])])], u = URL.createObjectURL(new Blob(["\uFEFF" + rows.map((r) => r.map(cell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" })), a = document.createElement("a");
      a.href = u;
      a.download = "access-filtered-" + config.start + ".csv";
      a.click();
      setTimeout(() => URL.revokeObjectURL(u), 1e3);
    };
    api("/me").then((d) => {
      role = d.member?.role || "";
      $("anNew").disabled = !["admin", "editor"].includes(role);
      $("anUseLink").disabled = !["admin", "editor"].includes(role);
      if (data) renderInitiatives();
      if (restoreView) {
        const button = $("accountButton"), open = () => {
          if (!/未接続/.test(button?.textContent || "\u672A\u63A5\u7D9A")) {
            document.querySelector('[data-view="analytics"]')?.click();
            return true;
          }
          return false;
        };
        if (!open()) {
          const watcher = new MutationObserver(() => {
            if (open()) watcher.disconnect();
          });
          if (button) watcher.observe(button, { childList: true, subtree: true });
        }
      }
    }).catch(() => {
    });
    document.querySelector('[data-view="analytics"]')?.addEventListener("click", () => {
      if (!data) load();
    });
    setTab(config.tab);
    if (config.tab === "reports") tabs.querySelector('[data-access-tab="reports"]').click();
    if (restoreView || view.classList.contains("active")) load();
  })();
})();
