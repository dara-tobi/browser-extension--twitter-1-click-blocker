/* Mock data + helpers */
const AVATAR_COLORS = [
  ["#1d9bf0","#0e6fc0"],["#f5b015","#e0890a"],["#15c97f","#0a9b5e"],
  ["#f6404c","#c91f2b"],["#a855f7","#7c3aed"],["#ec4899","#be1d6c"],
  ["#06b6d4","#0e7490"],["#f97316","#c2540a"],["#64748b","#475569"],
  ["#84cc16","#558207"],
];
function avatarFor(handle){
  let h = 0;
  for (let i=0;i<handle.length;i++) h = (h*31 + handle.charCodeAt(i)) >>> 0;
  const c = AVATAR_COLORS[h % AVATAR_COLORS.length];
  return { grad:`linear-gradient(145deg, ${c[0]}, ${c[1]})`, initial: handle.replace(/[^a-zA-Z0-9]/g,'').charAt(0).toUpperCase() || '?' };
}

const QUEUE_HANDLES = [
  "MArinze2993","AdmiralG5","Buck7990","LINTNBRS","malcom_fx","debo_bobor",
  "GodiiMuthamia","Maxwels40","RollsTv_","Adunniadee08","ScoreOdds","Racim5327",
  "JAYISNOTONLINE","cryptoshill_99","airdrop_king","get_rich_fast","nft_floor_x",
  "engagement_bot","reply_guy_420","spam_central","follow4follow_x","pump_signals",
  "freemoney_now","viral_hooks","grindset_daily","alpha_leaks_","dropship_dave",
  "ai_slop_posts","clickbait_co","botfarm_07","quote_tweeter","ratio_machine",
];
// a few flagged not-found
const NOT_FOUND = new Set(["GodiiMuthamia","Maxwels40","RollsTv_","Racim5327","botfarm_07","spam_central"]);

let _id = 1;
const makeQueue = () => QUEUE_HANDLES.map(h => ({
  id: _id++, handle: h, notFound: NOT_FOUND.has(h), status: "pending", selected:false
}));

const BLOCKED = ["ergasial","famesh2002","damioladimeji","bunmitijaan","ladieslense67","techacademys","abbkar_ai","pumpndump_x","scam_alerts99","mlm_hustler"]
  .map(h => ({ id:_id++, handle:h, when: Math.floor(Math.random()*20)+1 }));

const MUTED = ["thebeautyofafri","thoughtspointe","greatmindscomm","myhospitul","raphaelbizman","fctcarplug","selahafrik","spaceboy_air","ubiniboi","cee_collection","talktome87361","sen_onyekachi","hatzgadgets"]
  .map(h => ({ id:_id++, handle:h, when: Math.floor(Math.random()*30)+1 }));

const PAGE_TYPES = [
  { id:"home", name:"Home Timeline", icon:"home" },
  { id:"followers", name:"Followers", icon:"users" },
  { id:"following", name:"Following", icon:"users" },
  { id:"search", name:"Search Results", icon:"search" },
  { id:"communities", name:"Communities", icon:"users" },
  { id:"engagements", name:"Engagements", icon:"repeat" },
  { id:"replies", name:"Tweet Replies", icon:"reply" },
  { id:"trending", name:"Trending", icon:"flame" },
  { id:"notifications", name:"Notifications", icon:"bell" },
  { id:"hashtags", name:"Hashtags", icon:"hash" },
  { id:"profile", name:"Profile Pages", icon:"profile" },
  { id:"explore", name:"Explore", icon:"compass" },
];
const DEFAULT_PAGES = { home:false, followers:true, following:true, search:true, communities:true, engagements:true, replies:true, trending:false, notifications:false, hashtags:true, profile:true, explore:false };

// 14-day activity (blocks, mutes)
const ACTIVITY = [
  [2,1],[0,3],[5,2],[1,0],[3,4],[8,2],[2,1],[0,0],[4,3],[6,5],[1,2],[9,3],[3,1],[7,4]
];

Object.assign(window, { avatarFor, makeQueue, BLOCKED, MUTED, PAGE_TYPES, DEFAULT_PAGES, ACTIVITY });
