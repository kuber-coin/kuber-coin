// aiAssistant.ts - AI-powered assistant with NLP

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface CommandResult {
  success: boolean;
  action?: string;
  data?: any;
  response: string;
}

class AIAssistant {
  private conversationHistory: Message[] = [];

  async sendMessage(userMessage: string): Promise<Message> {
    // Add user message
    const userMsg: Message = {
      id: `msg_${Date.now()}_user`,
      role: 'user',
      content: userMessage,
      timestamp: Date.now()
    };
    this.conversationHistory.push(userMsg);

    // Process and generate response
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const response = await this.generateResponse(userMessage);
    
    const assistantMsg: Message = {
      id: `msg_${Date.now()}_assistant`,
      role: 'assistant',
      content: response,
      timestamp: Date.now()
    };
    this.conversationHistory.push(assistantMsg);

    return assistantMsg;
  }

  private async generateResponse(input: string): Promise<string> {
    const lowerInput = input.toLowerCase();

    // Balance inquiries
    if (lowerInput.includes('balance') || lowerInput.includes('how much')) {
      return "Your current balance is 125.5 KC. You have 3 pending transactions totaling 12.3 KC.";
    }

    // Send transaction
    if (lowerInput.includes('send') && lowerInput.includes('kc')) {
      const match = lowerInput.match(/send\s+(\d+(?:\.\d+)?)\s+kc/);
      if (match) {
        return `I'll help you send ${match[1]} KC. Please provide the recipient address or select from your contacts.`;
      }
      return "I can help you send Kubercoin. How much would you like to send?";
    }

    // Transaction history
    if (lowerInput.includes('transaction') || lowerInput.includes('history')) {
      return "Your recent transactions:\n• Received 50 KC from Alice (2 hours ago)\n• Sent 25 KC to Bob (5 hours ago)\n• Mining reward 10 KC (1 day ago)";
    }

    // Price/Market
    if (lowerInput.includes('price') || lowerInput.includes('market')) {
      return "Current KC price: $2.45 (+5.2% today). 24h High: $2.50, Low: $2.30. Market cap: $245M.";
    }

    // Portfolio analysis
    if (lowerInput.includes('portfolio') || lowerInput.includes('optimize')) {
      return "Your portfolio analysis:\n• Total value: $307.48\n• 30-day return: +12.3%\n• Risk level: Medium\n\nRecommendation: Consider diversifying by adding more staking positions.";
    }

    // Security
    if (lowerInput.includes('security') || lowerInput.includes('safe')) {
      return "Your security score is 78/100. I recommend:\n• Enable two-factor authentication\n• Set up backup recovery\n• Review recent login activity";
    }

    // Mining
    if (lowerInput.includes('mining') || lowerInput.includes('mine')) {
      return "Mining status:\n• Hash rate: 125 MH/s\n• Blocks mined today: 3\n• Estimated earnings: 15 KC/day\n• Next difficulty adjustment: in 2 days";
    }

    // Gas/Fees
    if (lowerInput.includes('gas') || lowerInput.includes('fee')) {
      return "Current network fees:\n• Low: 0.001 KC (~30 sec)\n• Medium: 0.002 KC (~15 sec)\n• High: 0.005 KC (~5 sec)\n\nI recommend using medium priority for normal transactions.";
    }

    // Generic help
    if (lowerInput.includes('help') || lowerInput.includes('can you')) {
      return "I can help you with:\n• Check your balance and transactions\n• Send KC to others\n• View market prices\n• Analyze your portfolio\n• Manage security settings\n• Monitor mining activity\n• Estimate gas fees\n\nJust ask me in natural language!";
    }

    // Default
    return "I understand you're asking about: \"" + input + "\". Could you provide more details? You can ask me about balance, transactions, prices, portfolio, security, mining, or fees.";
  }

  async parseCommand(input: string): Promise<CommandResult> {
    await new Promise(resolve => setTimeout(resolve, 300));

    const lowerInput = input.toLowerCase();

    // Send command
    if (lowerInput.includes('send')) {
      const amountMatch = lowerInput.match(/(\d+(?:\.\d+)?)\s*kc/);
      const addressMatch = lowerInput.match(/to\s+([a-z0-9]+)/i);

      if (amountMatch) {
        return {
          success: true,
          action: 'send',
          data: {
            amount: parseFloat(amountMatch[1]),
            to: addressMatch ? addressMatch[1] : null
          },
          response: `Preparing to send ${amountMatch[1]} KC${addressMatch ? ` to ${addressMatch[1]}` : ''}.`
        };
      }
    }

    // Check balance
    if (lowerInput.includes('balance') || lowerInput.includes('how much')) {
      return {
        success: true,
        action: 'check_balance',
        data: { balance: 125.5 },
        response: 'Checking your balance...'
      };
    }

    return {
      success: false,
      response: 'I couldn\'t parse that command. Try phrases like "send 10 KC to Alice" or "check my balance".'
    };
  }

  getConversationHistory(): Message[] {
    return [...this.conversationHistory];
  }

  clearHistory(): void {
    this.conversationHistory = [];
  }

  async getSuggestions(): Promise<string[]> {
    return [
      "What's my current balance?",
      "Send 10 KC to Alice",
      "Show my transaction history",
      "What's the current KC price?",
      "Analyze my portfolio",
      "Check security status",
      "What are the current gas fees?"
    ];
  }
}

const aiAssistant = new AIAssistant();
export default aiAssistant;