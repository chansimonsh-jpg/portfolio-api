const https = require('https');

function fetchURL(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    };
    https.get(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('Parse error')); }
      });
    }).on('error', reject);
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { symbol } = req.query;
  if (!symbol) return res.status(400).json({ error: 'Symbol required' });

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
    const data = await fetchURL(url);
    const meta = data?.chart?.result?.[0]?.meta;

    if (!meta) return res.status(404).json({ error: 'No data', symbol, dividendYield: 0 });

    const price = meta.regularMarketPrice ?? 0;
    const prev = meta.chartPreviousClose ?? price;
    const currency = meta.currency ?? 'USD';

    // 試用 v10 拿股息
    let dividendYield = 0;
    try {
      const v10url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=summaryDetail`;
      const v10data = await fetchURL(v10url);
      const summary = v10data?.quoteSummary?.result?.[0]?.summaryDetail;
      const dividendRate = summary?.dividendRate?.raw ?? 0;
      const isUK = symbol.endsWith('.L');
      const adjustedPrice = isUK ? price / 100 : price;

      if (dividendRate && adjustedPrice > 0) {
        dividendYield = dividendRate / adjustedPrice;
      } else {
        const yieldVal = summary?.d
