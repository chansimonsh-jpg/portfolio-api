export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { symbol } = req.query;

  if (!symbol) {
    return res.status(400).json({ error: 'Symbol required' });
  }

  try {
    // 5秒 timeout
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);

    // 用 Yahoo Finance quoteSummary endpoint
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=summaryDetail,price`;
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      }
    });
    clearTimeout(timer);

    const data = await response.json();
    const summaryDetail = data?.quoteSummary?.result?.[0]?.summaryDetail;
    const priceData = data?.quoteSummary?.result?.[0]?.price;

    if (!summaryDetail && !priceData) {
      return res.status(404).json({ error: 'No data found', symbol });
    }

    // 計算股息率
    const dividendRate = summaryDetail?.dividendRate?.raw ?? 0;
    const price = priceData?.regularMarketPrice?.raw ?? 0;
    const currency = priceData?.currency ?? 'USD';

    let dividendYield = 0;

    if (dividendRate && price > 0) {
      // 英股特殊處理（便士轉英鎊）
      const isUK = symbol.endsWith('.L');
      const adjustedPrice = isUK ? price / 100 : price;
      dividendYield = dividendRate / adjustedPrice;
    } else {
      // Fallback 用 dividendYield
      const yieldVal = summaryDetail?.dividendYield?.raw
        ?? summaryDetail?.trailingAnnualDividendYield?.raw
        ?? 0;
      if (yieldVal > 0 && yieldVal < 0.5) {
        dividendYield = yieldVal;
      }
    }

    return res.status(200).json({
      symbol,
      dividendYield: Math.round(dividendYield * 1000000) / 1000000,
      dividendRate,
      price,
      currency,
      source: 'yahoo',
    });

  } catch (error) {
    return res.status(500).json({
      error: 'Failed to fetch',
      symbol,
      dividendYield: 0,
    });
  }
}
