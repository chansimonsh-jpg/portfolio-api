export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { symbol } = req.query;
  if (!symbol) return res.status(400).json({ error: 'Symbol required' });

  // 試多個 Yahoo Finance endpoints
  const endpoints = [
    `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`,
    `https://query2.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`,
    `https://finance.yahoo.com/quote/${symbol}/`,
  ];

  for (const url of endpoints) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': 'https://finance.yahoo.com/',
          'Origin': 'https://finance.yahoo.com',
        }
      });
      clearTimeout(timer);

      if (!response.ok) continue;

      const data = await response.json();
      const meta = data?.chart?.result?.[0]?.meta;
      if (!meta) continue;

      const price = meta.regularMarketPrice ?? 0;
      const prev = meta.chartPreviousClose ?? price;
      const currency = meta.currency ?? 'USD';

      // 用 v10 拿股息
      const v10url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=summaryDetail`;
      let dividendYield = 0;

      try {
        const v10controller = new AbortController();
        const v10timer = setTimeout(() => v10controller.abort(), 5000);
        const v10res = await fetch(v10url, {
          signal: v10controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'Referer': 'https://finance.yahoo.com/',
          }
        });
        clearTimeout(v10timer);
        const v10data = await v10res.json();
        const summary = v10data?.quoteSummary?.result?.[0]?.summaryDetail;
        const dividendRate = summary?.dividendRate?.raw ?? 0;
        const isUK = symbol.endsWith('.L');
        const adjustedPrice = isUK ? price / 100 : price;

        if (dividendRate && adjustedPrice > 0) {
          dividendYield = dividendRate / adjustedPrice;
        } else {
          const yieldVal = summary?.dividendYield?.raw
            ?? summary?.trailingAnnualDividendYield?.raw ?? 0;
          if (yieldVal > 0 && yieldVal < 0.5) dividendYield = yieldVal;
        }
      } catch {}

      return res.status(200).json({
        symbol,
        price,
        change: price - prev,
        changePct: prev > 0 ? ((price - prev) / prev) * 100 : 0,
        currency,
        dividendYield: Math.round(dividendYield * 1000000) / 1000000,
        source: 'yahoo',
      });

    } catch (e) {
      continue;
    }
  }

  return res.status(404).json({ error: 'No data found', symbol, dividendYield: 0 });
}
