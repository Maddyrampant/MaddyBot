export const TEACH_FIELDS = {
  i_am: { en: "Who I am", fa: "من کیستم" },
  i_am_not: { en: "What I'm NOT", fa: "چه کسی نیستم" },
  recommend: { en: "What to recommend/give me", fa: "چه چیزی را به من پیشنهاد بده" },
  good: { en: "What is good for me", fa: "چه چیزی برایم خوب است" },
};

const MAX_ITEM = 300;

export function getTeach(user) {
  if (!user.teach) {
    user.teach = { i_am: [], i_am_not: [], recommend: [], good: [] };
  }
  return user.teach;
}

export function teachAdd(user, key, value) {
  if (!TEACH_FIELDS[key]) return { error: "unknown key" };
  const t = getTeach(user);
  const v = String(value).trim().replace(/\s+/g, " ").slice(0, MAX_ITEM);
  if (!v) return { error: "empty" };
  if (t[key].includes(v)) return { exists: true, key };
  t[key].push(v);
  return { added: true, key, field: t[key] };
}

export function teachClear(user, key) {
  const t = getTeach(user);
  if (key && TEACH_FIELDS[key]) {
    t[key] = [];
  } else {
    for (const k of Object.keys(TEACH_FIELDS)) t[k] = [];
  }
  return true;
}

export function teachCount(user) {
  const t = getTeach(user);
  return Object.keys(TEACH_FIELDS).reduce((n, k) => n + t[k].length, 0);
}

export function teachProfile(user) {
  const t = getTeach(user);
  const out = {};
  for (const [k, meta] of Object.entries(TEACH_FIELDS)) {
    out[k] = { fa: meta.fa, en: meta.en, items: [...t[k]] };
  }
  return out;
}

export function teachToPrompt(user) {
  const t = getTeach(user);
  const lines = [];
  for (const [k, meta] of Object.entries(TEACH_FIELDS)) {
    if (t[k] && t[k].length) {
      lines.push(`${meta.en}:`);
      for (const item of t[k]) lines.push(`- ${item}`);
    }
  }
  if (!lines.length) return "";
  return "Facts the user taught you about themselves (always respect these):\n" + lines.join("\n");
}
