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
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('Parse error'));
        }
      });
    }).on('error', reject);
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { symbol } = req.query;
  if (!symbol) {
    return res.status(400).json({ error: 'Symbol required' });
  }

  try {
    // 查過去 365 日數據，包括派息記錄
    const now = Math.floor(Date.now() / 1000);
    const oneYearAgo = now - 365 * 24 * 60 * 60;

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&period1=${oneYearAgo}&period2=${now}&events=dividends`;
    const data = await fetchURL(url);

    const result = data && data.chart && data.chart.result && data.chart.result[0];
    if (!result) {
      return res.status(404).json({ error: 'No data', symbol, dividendYield: 0 });
    }

    const meta = result.meta;
    const price = meta.regularMarketPrice || 0;
    const prev = meta.chartPreviousClose || price;
    const currency = meta.currency || 'USD';

    // 攞過去365日所有派息記錄
    const dividendEvents = result.events && result.events.dividends;
    let annualDividend = 0;

    if (dividendEvents) {
      // 加總所有派息
      const dividendList = Object.values(dividendEvents);
      annualDividend = dividendList.reduce((sum, d) => sum + (d.amount || 0), 0);
    }

    // 計算股息率
    let dividendYield = 0;
    if (annualDividend > 0 && price > 0) {
      const isUK = symbol.endsWith('.L');
      // 英股派息係便士，price 都係便士，所以直接除唔需要調整
      dividendYield = annualDividend / price;
    }

    return res.status(200).json({
      symbol,
      price,
      change: price - prev,
      changePct: prev > 0 ? ((price - prev) / prev) * 100 : 0,
      currency,
      dividendYield: Math.round(dividendYield * 1000000) / 1000000,
      annualDividend,
      dividendCount: dividendEvents ? Object.keys(dividendEvents).length : 0,
      source: 'yahoo-history',
    });

  } catch (error) {
    return res.status(500).json({
      error: error.message,
      symbol,
      dividendYield: 0,
    });
  }
};
