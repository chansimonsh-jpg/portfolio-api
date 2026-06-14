import json
import time
from datetime import datetime

import yfinance as yf

# 主要貨幣兌 USD 匯率
# Yahoo Finance currency pair 格式: "{CCY}USD=X" 即 1 unit of CCY = X USD
CURRENCIES = ["HKD", "GBP", "SGD", "IDR", "MYR", "CNY"]

MAX_RETRIES = 3
RETRY_DELAY = 5
REQUEST_DELAY = 1.5


def fetch_rate(currency):
    """回傳 1 unit of currency 兌 USD 嘅匯率 (USD per 1 unit)"""
    symbol = f"{currency}USD=X"
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            ticker = yf.Ticker(symbol)
            info = ticker.info
            price = (
                info.get("regularMarketPrice")
                or info.get("currentPrice")
                or info.get("previousClose")
                or 0
            )
            if price and float(price) > 0:
                rate = float(price)
                print(f"  {currency}: 1 {currency} = {rate:.6f} USD")
                return rate

            print(f"  {currency}: no price data")
            return None

        except Exception as e:
            print(f"  {currency}: attempt {attempt}/{MAX_RETRIES} failed - {e}")
            if attempt < MAX_RETRIES:
                time.sleep(RETRY_DELAY)
            else:
                print(f"  {currency}: giving up after {MAX_RETRIES} attempts")
                return None


def main():
    print(f"Fetching FX rates for {len(CURRENCIES)} currencies (vs USD)...")

    # 讀取現有資料作為 fallback
    existing_rates = {}
    version = "1.0.0"
    try:
        with open("rates.json", "r") as f:
            existing = json.load(f)
            existing_rates = existing.get("rates", {})
            parts = existing.get("version", "1.0.0").split(".")
            parts[2] = str(int(parts[2]) + 1)
            version = ".".join(parts)
    except Exception:
        pass

    rates = {"USD": 1.0}
    success = 0
    failed = 0
    errors = []

    for i, currency in enumerate(CURRENCIES, 1):
        rate = fetch_rate(currency)

        if rate is None:
            fallback = existing_rates.get(currency)
            if fallback:
                rates[currency] = fallback
                print(f"  {currency}: using cached rate {fallback}")
            failed += 1
            errors.append(currency)
        else:
            rates[currency] = round(rate, 6)
            success += 1

        if i < len(CURRENCIES):
            time.sleep(REQUEST_DELAY)

    output = {
        "version": version,
        "updatedAt": datetime.utcnow().strftime("%Y-%m-%d"),
        "base": "USD",
        "rates": rates,
    }

    with open("rates.json", "w") as f:
        json.dump(output, f, indent=2)

    print(f"\nDone! {success} fetched, {failed} fallback/failed")
    print(f"Updated rates.json to version {version}")

    if errors:
        print(f"\n[warn] Failed to fetch (kept old/missing): {', '.join(errors)}")
        if len(errors) > len(CURRENCIES) * 0.5:
            print(f"\n[error] Too many failures ({len(errors)}/{len(CURRENCIES)}), failing the job")
            exit(1)


if __name__ == "__main__":
    main()
