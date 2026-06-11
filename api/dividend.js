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
    const now = Math.floor(Date.now() / 1000);
    const oneYearAgo = now - 365 * 24 * 60 * 60;

    // 第一個 call：365日歷史 + 派息記錄
    const historyUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&period1=${oneYearAgo}&period2=${now}&events=dividends`;
    const historyData = await fetchURL(historyUrl);
    const historyResult = historyData &&
      historyData.chart &&
      historyData.chart.result &&
      historyData.chart.result[0];

    if (!historyResult) {
      return res.status(404).json({ error: 'No data', symbol, dividendYield: 0 });
    }

    const currency = (historyResult.meta && historyResult.meta.currency) || 'USD';

    // 攞過去365日所有派息
    const dividendEvents = historyResult.events && historyResult.events.dividends;
    let annualDividend = 0;
    let dividendCount = 0;

    if (dividendEvents) {
      const dividendList = Object.values(dividendEvents);
      dividendCount = dividendList.length;
      annualDividend = dividendList.reduce((sum, d) => sum + (d.amount || 0), 0);
    }

    // 第二個 call：查今日即時股價同變幅
    const todayUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
    let price = 0;
    let change = 0;
    let changePct = 0;

    try {
      const todayData = await fetchURL(todayUrl);
      const todayMeta = todayData &&
        todayData.chart &&
        todayData.chart.result &&
        todayData.chart.result[0] &&
        todayData.chart.result[0].meta;

      if (todayMeta) {
        price = todayMeta.regularMarketPrice || 0;
        const prev = todayMeta.chartPreviousClose || price;
        change = price - prev;
        changePct = prev > 0 ? ((price - prev) / prev) * 100 : 0;
      }
    } catch (e) {
      // 如果今日價格 call 失敗，用歷史數據最後價格
      price = (historyResult.meta && historyResult.meta.regularMarketPrice) || 0;
    }

    // 計算股息率
    let dividendYield = 0;
    if (annualDividend > 0 && price > 0) {
      dividendYield = annualDividend / price;
    }

    return res.status(200).json({
      symbol,
      price,
      change,
      changePct,
      currency,
      dividendYield: Math.round(dividendYield * 1000000) / 1000000,
      annualDividend: Math.round(annualDividend * 10000) / 10000,
      dividendCount,
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
