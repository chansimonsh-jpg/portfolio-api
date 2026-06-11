import yahooFinance from 'yahoo-finance2';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { symbol } = req.query;
  if (!symbol) return res.status(400).json({ error: 'Symbol required' });

  try {
    const quote = await yahooFinance.quoteSummary(symbol, {
      modules: ['summaryDetail', 'price'],
    });

    const summaryDetail = quote?.summaryDetail;
    const priceData = quote?.price;

    const price = priceData?.regularMarketPrice ?? 0;
    const prev = priceData?.regularMarketPreviousClose ?? price;
    const currency = priceData?.currency ?? 'USD';
    const dividendRate = summaryDetail?.dividendRate ?? 0;

    let dividendYield = 0;
    const isUK = symbol.endsWith('.L');
    const adjustedPrice = isUK ? price / 100 : price;

    if (dividendRate && adjustedPrice > 0) {
      dividendYield = dividendRate / adjustedPrice;
    } else {
      const yieldVal = summaryDetail?.dividendYield
        ?? summaryDetail?.trailingAnnualDividendYield
        ?? 0;
      if (yieldVal > 0 && yieldVal < 0.5) dividendYield = yieldVal;
    }

    return res.status(200).json({
      symbol,
      price,
      change: price - prev,
      changePct: prev > 0 ? ((price - prev) / prev) * 100 : 0,
      currency,
      dividendYield: Math.round(dividendYield * 1000000) / 1000000,
      source: 'yahoo-finance2',
    });

  } catch (error) {
    return res.status(404).json({
      error: error.message,
      symbol,
      dividendYield: 0,
    });
  }
}
