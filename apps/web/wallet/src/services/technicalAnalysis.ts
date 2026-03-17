import tradingEngine from './tradingEngine';

class TechnicalAnalysis {
  calculateRSI(pair: string, period: number = 14): number {
    const closes = this.getCloses(pair, period + 1);
    if (closes.length < period + 1) return 0;

    let gains = 0;
    let losses = 0;

    for (let i = 1; i < closes.length; i++) {
      const diff = closes[i] - closes[i - 1];
      if (diff >= 0) gains += diff;
      else losses += Math.abs(diff);
    }

    if (losses === 0) return 100;
    const rs = gains / losses;
    return 100 - 100 / (1 + rs);
  }

  calculateMACD(pair: string): { macd: number; signal: number; histogram: number } {
    const closes = this.getCloses(pair, 60);
    if (closes.length < 26) {
      return { macd: 0, signal: 0, histogram: 0 };
    }

    const ema12 = this.calculateEMAFromSeries(closes, 12);
    const ema26 = this.calculateEMAFromSeries(closes, 26);
    const macd = ema12 - ema26;
    const signal = this.calculateEMAFromSeries([macd], 9);
    const histogram = macd - signal;

    return { macd, signal, histogram };
  }

  calculateMovingAverage(pair: string, period: number): number {
    const closes = this.getCloses(pair, period);
    if (closes.length < period) return 0;
    const sum = closes.reduce((acc, value) => acc + value, 0);
    return sum / period;
  }

  calculateEMA(pair: string, period: number): number {
    const closes = this.getCloses(pair, period * 2);
    if (closes.length < period) return 0;
    return this.calculateEMAFromSeries(closes, period);
  }

  calculateBollingerBands(pair: string, period: number = 20, stdDev: number = 2): {
    upper: number;
    middle: number;
    lower: number;
    width: number;
  } {
    const closes = this.getCloses(pair, period);
    if (closes.length < period) {
      return { upper: 0, middle: 0, lower: 0, width: 0 };
    }

    const mean = closes.reduce((acc, value) => acc + value, 0) / period;
    const variance = closes.reduce((acc, value) => acc + Math.pow(value - mean, 2), 0) / period;
    const deviation = Math.sqrt(variance);
    const upper = mean + deviation * stdDev;
    const lower = mean - deviation * stdDev;
    const width = upper - lower;

    return { upper, middle: mean, lower, width };
  }

  calculateStochastic(pair: string, kPeriod: number = 14, dPeriod: number = 3): {
    k: number;
    d: number;
  } {
    const history = this.getHistory(pair, kPeriod + dPeriod);
    if (history.length < kPeriod) return { k: 0, d: 0 };

    const window = history.slice(-kPeriod);
    const highestHigh = Math.max(...window.map(c => c.high));
    const lowestLow = Math.min(...window.map(c => c.low));
    const currentClose = window[window.length - 1].close;

    const k = highestHigh === lowestLow
      ? 0
      : ((currentClose - lowestLow) / (highestHigh - lowestLow)) * 100;

    const recentK = history
      .slice(-dPeriod)
      .map(() => k);
    const d = recentK.reduce((acc, value) => acc + value, 0) / recentK.length;

    return { k, d };
  }

  calculateADX(pair: string, period: number = 14): number {
    const history = this.getHistory(pair, period + 1);
    if (history.length < period + 1) return 0;
    return 0;
  }

  calculateFibonacciRetracement(high: number, low: number): {
    level0: number;
    level236: number;
    level382: number;
    level500: number;
    level618: number;
    level786: number;
    level1000: number;
  } {
    const diff = high - low;
    
    return {
      level0: high,
      level236: high - diff * 0.236,
      level382: high - diff * 0.382,
      level500: high - diff * 0.500,
      level618: high - diff * 0.618,
      level786: high - diff * 0.786,
      level1000: low,
    };
  }

  calculatePivotPoints(high: number, low: number, close: number): {
    pivot: number;
    r1: number;
    r2: number;
    r3: number;
    s1: number;
    s2: number;
    s3: number;
  } {
    const pivot = (high + low + close) / 3;
    
    return {
      pivot,
      r1: 2 * pivot - low,
      r2: pivot + (high - low),
      r3: high + 2 * (pivot - low),
      s1: 2 * pivot - high,
      s2: pivot - (high - low),
      s3: low - 2 * (high - pivot),
    };
  }

  calculateATR(pair: string, period: number = 14): number {
    const history = this.getHistory(pair, period + 1);
    if (history.length < period + 1) return 0;

    let total = 0;
    for (let i = 1; i < history.length; i++) {
      const current = history[i];
      const prev = history[i - 1];
      const tr = Math.max(
        current.high - current.low,
        Math.abs(current.high - prev.close),
        Math.abs(current.low - prev.close)
      );
      total += tr;
    }

    return total / period;
  }

  calculateVWAP(pair: string): number {
    const history = this.getHistory(pair, 50);
    if (history.length === 0) return 0;

    let cumulativePV = 0;
    let cumulativeVolume = 0;
    history.forEach(candle => {
      cumulativePV += candle.close * candle.volume;
      cumulativeVolume += candle.volume;
    });

    return cumulativeVolume === 0 ? 0 : cumulativePV / cumulativeVolume;
  }

  detectPattern(pair: string): {
    pattern: string;
    direction: 'bullish' | 'bearish' | 'neutral';
    confidence: number;
  } | null {
    return null;
  }

  getTradingSignal(pair: string): {
    signal: 'strong buy' | 'buy' | 'neutral' | 'sell' | 'strong sell';
    score: number;
    indicators: { name: string; value: string; signal: string }[];
  } {
    // Combine multiple indicators for trading signal
    const rsi = this.calculateRSI(pair, 14);
    const macd = this.calculateMACD(pair);
    const currentPrice = tradingEngine.getCurrentPrice(pair);
    const ma50 = this.calculateMovingAverage(pair, 50);
    const ma200 = this.calculateMovingAverage(pair, 200);

    const indicators = [
      {
        name: 'RSI',
        value: rsi.toFixed(2),
        signal: rsi < 30 ? 'Buy' : rsi > 70 ? 'Sell' : 'Neutral',
      },
      {
        name: 'MACD',
        value: macd.macd.toFixed(2),
        signal: macd.macd > macd.signal ? 'Buy' : 'Sell',
      },
      {
        name: 'MA 50/200',
        value: `${ma50.toFixed(0)}/${ma200.toFixed(0)}`,
        signal: ma50 > ma200 ? 'Buy' : 'Sell',
      },
      {
        name: 'Price vs MA50',
        value: ((currentPrice / ma50 - 1) * 100).toFixed(2) + '%',
        signal: currentPrice > ma50 ? 'Buy' : 'Sell',
      },
    ];

    // Calculate score based on indicators
    let score = 0;
    indicators.forEach(ind => {
      if (ind.signal === 'Buy') score += 1;
      else if (ind.signal === 'Sell') score -= 1;
    });

    const normalizedScore = (score / indicators.length) * 100;

    let signal: 'strong buy' | 'buy' | 'neutral' | 'sell' | 'strong sell';
    if (normalizedScore >= 60) signal = 'strong buy';
    else if (normalizedScore >= 20) signal = 'buy';
    else if (normalizedScore <= -60) signal = 'strong sell';
    else if (normalizedScore <= -20) signal = 'sell';
    else signal = 'neutral';

    return { signal, score: normalizedScore, indicators };
  }

  backtestStrategy(
    pair: string,
    strategy: {
      type: 'sma-crossover' | 'rsi' | 'macd' | 'bollinger';
      params: any;
    },
    startDate: number,
    endDate: number
  ): {
    trades: number;
    winRate: number;
    totalPnL: number;
    sharpeRatio: number;
    maxDrawdown: number;
  } {
    return {
      trades: 0,
      winRate: 0,
      totalPnL: 0,
      sharpeRatio: 0,
      maxDrawdown: 0,
    };
  }

  private getHistory(pair: string, limit: number) {
    return tradingEngine.getPriceHistory(pair, '1m', limit);
  }

  private getCloses(pair: string, limit: number): number[] {
    return this.getHistory(pair, limit).map(candle => candle.close);
  }

  private calculateEMAFromSeries(values: number[], period: number): number {
    if (values.length === 0) return 0;
    const k = 2 / (period + 1);
    let ema = values[0];
    for (let i = 1; i < values.length; i++) {
      ema = values[i] * k + ema * (1 - k);
    }
    return ema;
  }
}

const technicalAnalysis = new TechnicalAnalysis();
export default technicalAnalysis;
