const members = Object.freeze({
  kanto: "kanto-toshiki",
  kajiwara: "kajiwara-yusuke",
  kimura: "kimura-koharu",
  ito: "ito-masaya",
  tsunashima: "tsunashima-shu",
  kojima: "kojima-ken",
  kaigaishi: "kaigaishi-shogo",
  kuroishi: "kuroishi-ryota",
  kaito: "kaito-taisho",
  nakagawa: "nakagawa-masahiro",
});

const media = new Set(["x", "instagram", "facebook", "line", "note", "youtube", "threads", "linkedin", "sns"]);
const xDefaults = new Set(["kanto", "kajiwara", "kimura", "ito", "tsunashima", "kojima", "kaigaishi"]);

export default {
  fetch(request) {
    const path = new URL(request.url).pathname;
    const match = /^\/go\/([a-z]+)(?:\/([a-z]+))?\/?$/.exec(path);
    const headers = { "cache-control": "no-store", "x-robots-tag": "noindex", "x-content-type-options": "nosniff" };
    if (!match || !Object.hasOwn(members, match[1])) return new Response("Not Found", { status: 404, headers });
    const source = match[2] || (xDefaults.has(match[1]) ? "x" : "sns");
    if (!media.has(source)) return new Response("Not Found", { status: 404, headers });
    if (!["GET", "HEAD"].includes(request.method)) return new Response("Method Not Allowed", { status: 405, headers: { ...headers, allow: "GET, HEAD" } });
    const destination = new URL("https://basecraftas.com/projects/totonoe/");
    destination.searchParams.set("utm_source", source);
    destination.searchParams.set("utm_medium", "organic_social");
    destination.searchParams.set("utm_campaign", "totonoe_team");
    destination.searchParams.set("utm_content", members[match[1]]);
    return new Response(null, { status: 302, headers: { ...headers, location: destination.href } });
  },
};
