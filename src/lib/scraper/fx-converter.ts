let cachedRates: Record<string, number> | null = null;
let cacheDate: string | null = null;

export async function convertToUSD(amount: number | null | undefined, currency: string): Promise<number | null> {
  if (amount == null) return null;
  if (currency === 'USD') return amount;
  
  const today = new Date().toISOString().split('T')[0];
  
  if (!cachedRates || cacheDate !== today) {
    try {
      const response = await fetch('https://api.frankfurter.app/latest?from=USD');
      const data = await response.json();
      cachedRates = data.rates;
      cacheDate = today;
    } catch (e) {
      console.error('Failed to fetch FX rates', e);
      return amount; // Fallback if API fails
    }
  }

  const rate = cachedRates![currency];
  if (!rate) return amount; // Unknown currency fallback
  
  // Frankfurter gives how much 1 USD is in the target currency (e.g. 1 USD = 0.92 EUR)
  // To convert EUR back to USD, we divide by the rate
  return parseFloat((amount / rate).toFixed(2));
}
