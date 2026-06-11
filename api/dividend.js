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
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
    const data = await fetchURL(url);
    const meta = data && data.chart && data.chart.result && data.chart.result[0] && data.chart.result[0].meta;

    if (!meta) {
      return res.status(404).json({ error: 'No data', symbol: symbol, dividendYield: 0 });
    }

    const price = meta.regularMarketPrice || 0;
    const prev = meta.chartPreviousClose || price;
    const currency = meta.currency || 'USD';

    let dividendYield = 0;

    try {
      const v10url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=summaryDetail`;
      const v10data = await fetchURL(v10url);
      const result = v10data && v10data.quoteSummary && v10data.quoteSummary.result && v10data.quoteSummary.result[0];
      const summary = result && result.summaryDetail;

      if (summary) {
        const dividendRate = (summary.dividendRate && summary.dividendRate.raw) || 0;
        const isUK = symbol.endsWith('.L');
        const adjustedPrice = isUK ? price / 100 : price;

        if (dividendRate && adjustedPrice > 0) {
          dividendYield = dividendRate / adjustedPrice;
        } else {
          const yieldVal = (summary.dividendYield && summary.dividendYield.raw) ||
            (summary.trailingAnnualDividendYield && summary.trailingAnnualDividendYield.raw) || 0;
          if (yieldVal > 0 && yieldVal < 0.5) {
            dividendYield = yieldVal;
          }
        }
      }
    } catch (e) {
      dividendYield = 0;
    }

    return res.status(200).json({
      symbol: symbol,
      price: price,
      change: price - prev,
      changePct: prev > 0 ? ((price - prev) / prev) * 100 : 0,
      currency: currency,
      dividendYield: Math.round(dividendYield * 1000000) / 1000000,
      source: 'yahoo',
    });

  } catch (error) {
    return res.status(500).json({
      error: error.message,
      symbol: symbol,
      dividendYield: 0,
    });
  }
};
