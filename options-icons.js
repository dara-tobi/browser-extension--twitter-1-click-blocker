/* Icon set — minimal line icons (from design guide) */
const ICON_PATHS = {
  block: '<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>',
  mute: '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="m23 9-6 6"/><path d="m17 9 6 6"/>',
  stats: '<path d="M3 3v18h18"/><rect x="7" y="11" width="3" height="6" rx="1"/><rect x="13" y="7" width="3" height="10" rx="1"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  backup: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>',
  trash: '<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
  ext: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/>',
  menu: '<path d="M3 6h18"/><path d="M3 12h18"/><path d="M3 18h18"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 5a3.5 3.5 0 0 1 0 6.8"/><path d="M21.5 20a6.5 6.5 0 0 0-5-6.3"/>',
  hash: '<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
  trend: '<path d="M22 7 13.5 15.5 8.5 10.5 2 17"/><path d="M16 7h6v6"/>',
  reply: '<path d="M9 17 4 12l5-5"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z" fill="currentColor" stroke="none"/>',
  profile: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="M5.5 17a3.5 3.5 0 0 1 7 0"/><path d="M15 9h4M15 13h4"/>',
  repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
  flame: '<path d="M12 2c1 4 4 5 4 9a4 4 0 0 1-8 0c0-1 .5-2 1-2.5C8 11 9 13 9 13c-2-5 1-8 3-11z"/>',
  sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3"/><circle cx="4" cy="12" r="2"/><circle cx="12" cy="6" r="2"/><circle cx="20" cy="14" r="2"/>',
  shield: '<path d="M12 2 4 5v6c0 5 3.5 8.5 8 11 4.5-2.5 8-6 8-11V5z"/><path d="m9 12 2 2 4-4"/>',
  ghost: '<path d="M9 10h.01M15 10h.01"/><path d="M12 2a8 8 0 0 0-8 8v11l3-2 3 2 2-2 2 2 3-2 3 2V10a8 8 0 0 0-8-8z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
  database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3"/>',
  queue: '<path d="M3 5h13"/><path d="M3 12h9"/><path d="M3 19h13"/><path d="m17 8 4 4-4 4"/>',
  play: '<path d="M6 4l14 8-14 8z" fill="currentColor" stroke="none"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor" stroke="none"/>',
  minus: '<path d="M5 12h14"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'
};

function icon(name, size, stroke) {
  const s = size || 18;
  const paths = ICON_PATHS[name] || '';
  return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="${stroke || 'currentColor'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

const AVATAR_COLORS = [
  ['#1d9bf0', '#0e6fc0'], ['#f5b015', '#e0890a'], ['#15c97f', '#0a9b5e'],
  ['#f6404c', '#c91f2b'], ['#a855f7', '#7c3aed'], ['#ec4899', '#be1d6c'],
  ['#06b6d4', '#0e7490'], ['#f97316', '#c2540a'], ['#64748b', '#475569'],
  ['#84cc16', '#558207']
];

function avatarFor(handle) {
  let h = 0;
  for (let i = 0; i < handle.length; i++) h = (h * 31 + handle.charCodeAt(i)) >>> 0;
  const c = AVATAR_COLORS[h % AVATAR_COLORS.length];
  const initial = (handle.replace(/[^a-zA-Z0-9]/g, '').charAt(0) || '?').toUpperCase();
  return { grad: `linear-gradient(145deg, ${c[0]}, ${c[1]})`, initial };
}

const PAGE_TYPES = [
  { id: 'timeline', name: 'Home Timeline', icon: 'home' },
  { id: 'followers', name: 'Followers', icon: 'users' },
  { id: 'following', name: 'Following', icon: 'users' },
  { id: 'search', name: 'Search Results', icon: 'search' },
  { id: 'communities', name: 'Communities', icon: 'users' },
  { id: 'engagements', name: 'Engagements', icon: 'repeat' },
  { id: 'status', name: 'Tweet Replies', icon: 'reply' },
  { id: 'trending', name: 'Trending', icon: 'flame' },
  { id: 'notifications', name: 'Notifications', icon: 'bell' },
  { id: 'hashtag', name: 'Hashtags', icon: 'hash' },
  { id: 'profile', name: 'Profile Pages', icon: 'profile' },
  { id: 'explore', name: 'Explore', icon: 'compass' }
];
