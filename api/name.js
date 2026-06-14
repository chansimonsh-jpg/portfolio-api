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

// 獨立 endpoint：攞公司名稱 (longname/shortname)
// 用法: /api/name?symbol=1929.HK
// Response: { symbol, name }
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { symbol } = req.query;
  if (!symbol) {
    return res.status(400).json({ error: 'Symbol required' });
  }

  try {
    const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(symbol)}&quotesCount=1&newsCount=0`;
    const data = await fetchURL(url);
    const quote = data && data.quotes && data.quotes[0];
    const name = (quote && (quote.longname || quote.shortname)) || null;

    return res.status(200).json({ symbol, name });
  } catch (error) {
    return res.status(200).json({ symbol, name: null });
  }
};
