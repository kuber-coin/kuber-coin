'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/Card';
import aiAssistant, { Message } from '@/services/aiAssistant';
import mlEngine, { PortfolioOptimization, Anomaly, PricePrediction } from '@/services/mlEngine';
import walletService from '@/services/wallet';
import priceService from '@/services/priceService';
import { ChatInterface } from '@/components/ChatInterface';
import { AIInsights } from '@/components/AIInsights';

export default function AssistantPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioOptimization | null>(null);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [prediction, setPrediction] = useState<PricePrediction | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    // Load conversation history
    const history = aiAssistant.getConversationHistory();
    setMessages(history);

    // Load suggestions
    const sug = await aiAssistant.getSuggestions();
    setSuggestions(sug);

    // Load ML insights
    loadMLInsights();
  };

  const loadMLInsights = async () => {
    try {
      const activeWallet = walletService.getActiveWallet();
      const holdings = activeWallet ? { KC: activeWallet.balance } : {};
      const portfolioData = await mlEngine.optimizePortfolio(holdings);
      setPortfolio(portfolioData);

      const txHistory = activeWallet
        ? await walletService.getTransactionHistory(activeWallet.address, 100)
        : [];
      const anomalyData = await mlEngine.detectAnomalies(
        txHistory.map((tx) => ({
          amount: tx.amount,
          to: tx.address || '',
          timestamp: tx.timestamp || 0,
        }))
      );
      setAnomalies(anomalyData);

      const history = priceService.getPriceHistory(30).map((point) => point.price);
      const predictionData = history.length > 0
        ? await mlEngine.predictPrice(history)
        : null;
      setPrediction(predictionData);
    } catch (error) {
      console.error('Error loading ML insights:', error);
    }
  };

  const handleSendMessage = async (userMessage: string) => {
    setIsTyping(true);

    try {
      const response = await aiAssistant.sendMessage(userMessage);
      const history = aiAssistant.getConversationHistory();
      setMessages(history);
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">AI Assistant</h1>
        <p className="text-gray-600 mt-1">Get intelligent insights and assistance for your wallet</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="p-6">
          <div className="text-sm text-gray-600 mb-1">Conversations</div>
          <div className="text-3xl font-bold text-blue-600">
            {Math.floor(messages.length / 2)}
          </div>
        </Card>

        <Card className="p-6">
          <div className="text-sm text-gray-600 mb-1">Anomalies Found</div>
          <div className="text-3xl font-bold text-orange-600">
            {anomalies.length}
          </div>
        </Card>

        <Card className="p-6">
          <div className="text-sm text-gray-600 mb-1">Sharpe Ratio</div>
          <div className="text-3xl font-bold text-green-600">
            {portfolio?.sharpeRatio.toFixed(2) || '—'}
          </div>
        </Card>

        <Card className="p-6">
          <div className="text-sm text-gray-600 mb-1">Price Trend</div>
          <div className={`text-xl font-bold ${
            prediction?.trend === 'bullish' ? 'text-green-600' :
            prediction?.trend === 'bearish' ? 'text-red-600' : 'text-gray-600'
          }`}>
            {prediction?.trend === 'bullish' && '📈 Bullish'}
            {prediction?.trend === 'bearish' && '📉 Bearish'}
            {prediction?.trend === 'neutral' && '➡️ Neutral'}
            {!prediction && '—'}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Left: Chat Interface */}
        <div>
          <ChatInterface
            messages={messages}
            onSendMessageAction={handleSendMessage}
            isTyping={isTyping}
            suggestions={suggestions}
          />
        </div>

        {/* Right: AI Insights */}
        <div>
          <AIInsights
            portfolio={portfolio || undefined}
            anomalies={anomalies}
            prediction={prediction || undefined}
            onRefreshAction={loadMLInsights}
          />
        </div>
      </div>

      {/* Features Info */}
      <Card className="p-6 bg-gradient-to-r from-blue-50 to-purple-50 border-2 border-blue-200">
        <h3 className="text-xl font-bold mb-4">🤖 AI Features</h3>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <h4 className="font-semibold mb-2">💬 Natural Language</h4>
            <p className="text-sm text-gray-700">
              Ask questions in plain English. The AI understands context and provides helpful responses.
            </p>
          </div>
          <div>
            <h4 className="font-semibold mb-2">📊 Portfolio Optimization</h4>
            <p className="text-sm text-gray-700">
              ML-powered analysis using Sharpe ratio maximization to recommend optimal asset allocation.
            </p>
          </div>
          <div>
            <h4 className="font-semibold mb-2">🔍 Anomaly Detection</h4>
            <p className="text-sm text-gray-700">
              Z-score analysis detects unusual spending patterns and suspicious activity automatically.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
