// api/suggest-stock.js
//
// 用戶 "+ Add manually" 後，real-time fetch 成功，
// 將新 symbol 上報為 GitHub issue，方便 review 後加入 stocks.json
//
// 環境變數需要設定（Vercel project settings -> Environment Variables）：
//   GITHUB_TOKEN  - Fine-grained PAT, scope: chansimonsh-jpg/portfolio-stocks -> Issues: Read & Write
//   GITHUB_REPO   - 例如 "chansimonsh-jpg/portfolio-stocks"

const GITHUB_API = 'https://api.github.com';
const MAX_PER_IP_PER_DAY = 5;

// 簡單 in-memory rate limit（Vercel serverless 冷啟動會重置，
// 加上 GitHub issue 去重作為第二層保護）
const rateLimitStore = new Map(); // key: "ip:date" -> count

function getClientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

function checkRateLimit(ip) {
  const today = new Date().toISOString().split('T')[0];
  const key = `${ip}:${today}`;
  const count = rateLimitStore.get(key) || 0;
  if (count >= MAX_PER_IP_PER_DAY) return false;
  rateLimitStore.set(key, count + 1);
  // 清理舊 entries，避免 map 無限增長
  if (rateLimitStore.size > 1000) {
    for (const k of rateLimitStore.keys()) {
      if (!k.endsWith(today)) rateLimitStore.delete(k);
    }
  }
  return true;
}

async function findExistingIssue(repo, token, title) {
  const query = encodeURIComponent(`repo:${repo} type:issue in:title "${title}"`);
  const res = await fetch(`${GITHUB_API}/search/issues?q=${query}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'portfolio-api',
    },
  });
  if (!res.ok) return false;
  const data = await res.json();
  return (data.total_count ?? 0) > 0;
}

async function createIssue(repo, token, title, body, labels) {
  const res = await fetch(`${GITHUB_API}/repos/${repo}/issues`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'portfolio-api',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title,
      body,
      labels,
    }),
  });
  return res.ok;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { symbol, name, market, exchange, currency, type, suffix, mismatch, oldName } = req.body || {};

  if (!symbol || !name) {
    return res.status(400).json({ error: 'symbol and name are required' });
  }

  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;

  if (!token || !repo) {
    // 未設定 GitHub 整合，靜默成功（唔影響 app 主流程）
    return res.status(200).json({ ok: true, reported: false, reason: 'not_configured' });
  }

  const ip = getClientIp(req);
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ ok: false, reported: false, reason: 'rate_limited' });
  }

  const title = mismatch
    ? `[Auto] Name mismatch: ${symbol} - "${oldName}" -> "${name}"`
    : `[Auto] New symbol: ${symbol} - ${name}`;

  try {
    const exists = await findExistingIssue(repo, token, title);
    if (exists) {
      return res.status(200).json({ ok: true, reported: false, reason: 'duplicate' });
    }

    // 組裝一個可以直接 copy-paste 入 stocks.json 嘅 entry
    const entry = {
      symbol,
      name,
      market: market ?? '?',
      type: type ?? 'Stock',
      exchange: exchange ?? '?',
    };
    if (suffix) entry.suffix = suffix;
    const entryJson = JSON.stringify(entry, null, 2)
      .split('\n')
      .map((line, i) => (i === 0 ? line : '    ' + line))
      .join('\n');

    const body = mismatch
      ? [
          `\`stocks.json\` has \`"name": "${oldName}"\` for \`${symbol}\`, but Yahoo Finance returns a different name.`,
          '',
          '**Updated entry — replace the existing one in `stocks.json`:**',
          '```json',
          entryJson + ',',
          '```',
          '',
          '| Field | stocks.json (old) | Yahoo Finance (new) |',
          '|---|---|---|',
          `| name | ${oldName} | ${name} |`,
          `| exchange | - | ${exchange ?? '?'} |`,
          '',
          'Verify and update `stocks.json` (bump `version`), then close this issue.',
        ].join('\n')
      : [
          'A user added this symbol via "+ Add manually" and real-time fetch succeeded.',
          '',
          '**Ready to paste into `stocks.json` (inside the `stocks` array):**',
          '```json',
          entryJson + ',',
          '```',
          '',
          '| Field | Value |',
          '|---|---|',
          `| symbol | \`${symbol}\` |`,
          `| name | ${name} |`,
          `| market | ${market ?? '?'} |`,
          `| exchange | ${exchange ?? '?'} |`,
          `| currency | ${currency ?? '?'} |`,
          `| suffix | ${suffix ? `\`${suffix}\`` : '(none)'} |`,
          '',
          'Review (especially the company name and exchange), paste into `stocks.json`, bump `version`, then close this issue.',
        ].join('\n');

    const labels = mismatch
      ? ['name-mismatch', 'auto-suggested']
      : ['new-symbol', 'auto-suggested'];

    const created = await createIssue(repo, token, title, body, labels);
    return res.status(200).json({ ok: true, reported: created });
  } catch (e) {
    // 上報失敗唔應該影響用戶 add holding，靜默處理
    return res.status(200).json({ ok: true, reported: false, reason: 'error' });
  }
}
