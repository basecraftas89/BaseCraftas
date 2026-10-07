// Keep this local link tool out of dist. The default X link is one evergreen URL per member.
const members = new Set(['kanto-toshiki', 'kajiwara-yusuke', 'kaito-taisho', 'nakagawa-masahiro', 'kimura-koharu', 'ito-masaya', 'tsunashima-shu', 'kuroishi-ryota', 'kojima-ken', 'kaigaishi-shogo']);
// Mirror the X links currently published on projects/totonoe/team.html.
export const xMembers = Object.freeze([
  { id: 'kanto-toshiki', name: '神藤 俊希', account: 'https://x.com/kanto_aipt_base' },
  { id: 'kajiwara-yusuke', name: '梶原 祐輔', account: 'https://x.com/nexus_pt_kp' },
  { id: 'kimura-koharu', name: '木村 倖晴', account: 'https://x.com/DxKimura' },
  { id: 'ito-masaya', name: '伊東 雅也', account: 'https://x.com/masaya_ito_pt' },
  { id: 'tsunashima-shu', name: '綱島 脩', account: 'https://x.com/tebapapapt' },
  { id: 'kojima-ken', name: '小島 健', account: 'https://x.com/kojimanabot' },
  { id: 'kaigaishi-shogo', name: '貝ヶ石 祥吾', account: 'https://x.com/kaishoupt' },
]);
const sources = new Set(['x', 'instagram', 'note', 'facebook', 'eight', 'prairie_card', 'youtube']);
const destinations = {
  home: '/projects/totonoe/',
  tayori: '/projects/totonoe/tayori.html',
  seminar: '/projects/totonoe/contents.html#seminars',
};
const slug = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function campaignLink({ member, source, placement, post, destination }) {
  if (!members.has(member)) throw new Error('Unknown member');
  if (!sources.has(source)) throw new Error('Unsupported SNS source');
  if (source === 'x' && !xMembers.some((item) => item.id === member)) throw new Error('Member has no X account on the team page');
  if (!['post', 'profile', 'story', 'bio', 'card'].includes(placement)) throw new Error('Unsupported placement');
  if (!slug.test(post)) throw new Error('Post ID must be 1–64 lowercase letters, digits or hyphens');
  if (!Object.hasOwn(destinations, destination)) throw new Error('Unknown destination');
  const url = new URL(destinations[destination], 'https://basecraftas.com');
  url.searchParams.set('utm_source', source);
  url.searchParams.set('utm_medium', 'organic_social');
  url.searchParams.set('utm_campaign', 'totonoe_team');
  url.searchParams.set('utm_content', `${member}_${placement}_${post}`);
  return url.href;
}

export function memberXLink(member) {
  if (!xMembers.some((item) => item.id === member)) throw new Error('Member has no X account on the team page');
  const url = new URL('/projects/totonoe/', 'https://basecraftas.com');
  url.searchParams.set('utm_source', 'x');
  url.searchParams.set('utm_medium', 'organic_social');
  url.searchParams.set('utm_campaign', 'totonoe_team');
  url.searchParams.set('utm_content', member);
  return url.href;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  if (process.argv.includes('--list-x')) {
    for (const person of xMembers) {
      const link = memberXLink(person.id);
      console.log([person.name, person.account, link].join('\t'));
    }
    process.exit(0);
  }
  const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
    const [key, ...value] = arg.replace(/^--/, '').split('=');
    return [key, value.join('=')];
  }));
  try {
    console.log(campaignLink(args));
  } catch (error) {
    console.error(error.message);
    console.error('Usage: node scripts/totonoe-campaign-link.mjs --member=kojima-ken --source=x --placement=post --post=20261002-tayori --destination=tayori');
    process.exitCode = 1;
  }
}
