const https = require('https');

function fetchURL(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cookie': 'GUC=AQEBCAFn; A1=d=AQABBCTv; A3=d=AQABBCTv',
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
    // 用 v7 quote endpoint，包含股息數據
    const quoteUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}&fields=regularMarketPrice,regularMarketPreviousClose,currency,trailingAnnualDividendRate,trailingAnnualDividendYield,dividendRate,dividendYield`;
    const quoteData = await fetchURL(quoteUrl);
    const quoteResult = quoteData &&
      quoteData.quoteResponse &&
      quoteData.quoteResponse.result &&
      quoteData.quoteResponse.result[0];

    if (!quoteResult) {
      return res.status(404).json({ error: 'No data', symbol, dividendYield: 0 });
    }

    const price = quoteResult.regularMarketPrice || 0;
    const prev = quoteResult.regularMarketPreviousClose || price;
    const currency = quoteResult.currency || 'USD';

    // 計算股息率
    let dividendYield = 0;
    const isUK = symbol.endsWith('.L');
    const adjustedPrice = isUK ? price / 100 : price;

    // 方法一：用 trailingAnnualDividendRate ÷ price
    const trailingRate = quoteResult.trailingAnnualDividendRate || 0;
    if (trailingRate && adjustedPrice > 0) {
      dividendYield = trailingRate / adjustedPrice;
    }

    // 方法二：直接用 trailingAnnualDividendYield
    if (!dividendYield) {
      const trailingYield = quoteResult.trailingAnnualDividendYield || 0;
      if (trailingYield > 0 && trailingYield < 0.5) {
        dividendYield = trailingYield;
      }
    }

    // 方法三：用 dividendRate ÷ price
    if (!dividendYield) {
      const divRate = quoteResult.dividendRate || 0;
      if (divRate && adjustedPrice > 0) {
        dividendYield = divRate / adjustedPrice;
      }
    }

    return res.status(200).json({
      symbol,
      price,
      change: price - prev,
      changePct: prev > 0 ? ((price - prev) / prev) * 100 : 0,
      currency,
      dividendYield: Math.round(dividendYield * 1000000) / 1000000,
      source: 'yahoo',
    });

  } catch (error) {
    return res.status(500).json({
      error: error.message,
      symbol,
      dividendYield: 0,
    });
  }
};
