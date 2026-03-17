// nlpParser.ts - Natural Language Processing for command parsing

export interface ParsedCommand {
  intent: 'send' | 'check_balance' | 'transaction_history' | 'price' | 'help' | 'unknown';
  entities: {
    amount?: number;
    currency?: string;
    recipient?: string;
    timeframe?: string;
    [key: string]: any;
  };
  confidence: number;
}

class NLPParser {
  parse(input: string): ParsedCommand {
    const lower = input.toLowerCase().trim();

    // Send intent
    if (this.matchesPattern(lower, ['send', 'transfer', 'pay'])) {
      return {
        intent: 'send',
        entities: this.extractSendEntities(lower),
        confidence: 0.85
      };
    }

    // Balance check intent
    if (this.matchesPattern(lower, ['balance', 'how much', 'wallet'])) {
      return {
        intent: 'check_balance',
        entities: {},
        confidence: 0.90
      };
    }

    // Transaction history intent
    if (this.matchesPattern(lower, ['transaction', 'history', 'recent', 'activity'])) {
      return {
        intent: 'transaction_history',
        entities: {
          timeframe: this.extractTimeframe(lower)
        },
        confidence: 0.85
      };
    }

    // Price check intent
    if (this.matchesPattern(lower, ['price', 'market', 'value', 'worth'])) {
      return {
        intent: 'price',
        entities: {},
        confidence: 0.88
      };
    }

    // Help intent
    if (this.matchesPattern(lower, ['help', 'what can', 'how to'])) {
      return {
        intent: 'help',
        entities: {},
        confidence: 0.95
      };
    }

    return {
      intent: 'unknown',
      entities: {},
      confidence: 0.0
    };
  }

  private matchesPattern(input: string, keywords: string[]): boolean {
    return keywords.some(keyword => input.includes(keyword));
  }

  private extractSendEntities(input: string): { amount?: number; currency?: string; recipient?: string } {
    const entities: { amount?: number; currency?: string; recipient?: string } = {};

    // Extract amount
    const amountMatch = input.match(/(\d+(?:\.\d+)?)\s*(kc|kubercoin)?/i);
    if (amountMatch) {
      entities.amount = parseFloat(amountMatch[1]);
      entities.currency = amountMatch[2]?.toUpperCase() || 'KC';
    }

    // Extract recipient
    const toMatch = input.match(/to\s+([a-z0-9]+)/i);
    if (toMatch) {
      entities.recipient = toMatch[1];
    }

    return entities;
  }

  private extractTimeframe(input: string): string {
    if (input.includes('today')) return 'today';
    if (input.includes('yesterday')) return 'yesterday';
    if (input.includes('week')) return 'week';
    if (input.includes('month')) return 'month';
    if (input.includes('year')) return 'year';
    return 'all';
  }

  tokenize(input: string): string[] {
    // Simple tokenization
    return input
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(token => token.length > 0);
  }

  extractEntities(input: string): Array<{ type: string; value: string; position: number }> {
    const entities: Array<{ type: string; value: string; position: number }> = [];

    // Extract numbers
    const numberRegex = /\d+(?:\.\d+)?/g;
    let match;
    while ((match = numberRegex.exec(input)) !== null) {
      entities.push({
        type: 'NUMBER',
        value: match[0],
        position: match.index
      });
    }

    // Extract addresses (KC1...)
    const addressRegex = /KC1[a-zA-Z0-9]{38}/g;
    while ((match = addressRegex.exec(input)) !== null) {
      entities.push({
        type: 'ADDRESS',
        value: match[0],
        position: match.index
      });
    }

    // Extract names (capitalized words)
    const nameRegex = /\b[A-Z][a-z]+\b/g;
    while ((match = nameRegex.exec(input)) !== null) {
      entities.push({
        type: 'NAME',
        value: match[0],
        position: match.index
      });
    }

    return entities;
  }

  calculateSimilarity(str1: string, str2: string): number {
    // Levenshtein distance for similarity
    const len1 = str1.length;
    const len2 = str2.length;
    const matrix: number[][] = [];

    for (let i = 0; i <= len1; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= len2; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    const distance = matrix[len1][len2];
    const maxLen = Math.max(len1, len2);
    return 1 - distance / maxLen;
  }
}

const nlpParser = new NLPParser();
export default nlpParser;