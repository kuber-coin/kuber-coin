'use client';

import { useState, useRef, useEffect } from 'react';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Message } from '@/services/aiAssistant';

interface ChatInterfaceProps {
  messages: Message[];
  onSendMessageAction: (message: string) => void;
  isTyping?: boolean;
  suggestions?: string[];
}

export function ChatInterface({ messages, onSendMessageAction, isTyping, suggestions = [] }: ChatInterfaceProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (input.trim()) {
      onSendMessageAction(input);
      setInput('');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Card className="flex flex-col h-[600px]">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <div className="text-6xl mb-4">🤖</div>
            <h3 className="text-xl font-semibold mb-2">AI Assistant</h3>
            <p className="mb-6">Ask me anything about your wallet, transactions, or the market!</p>
            
            {suggestions.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700">Try asking:</p>
                {suggestions.slice(0, 3).map((suggestion, i) => (
                  <button
                    key={i}
                    onClick={() => setInput(suggestion)}
                    className="block mx-auto px-4 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 text-sm"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] px-4 py-3 rounded-lg ${
                    message.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-900'
                  }`}
                >
                  <div className="whitespace-pre-wrap">{message.content}</div>
                  <div className={`text-xs mt-1 ${message.role === 'user' ? 'text-blue-200' : 'text-gray-500'}`}>
                    {new Date(message.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-gray-100 text-gray-900 px-4 py-3 rounded-lg">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 p-4">
        <div className="flex space-x-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type your message..."
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
          />
          <Button
            variant="primary"
            onClick={handleSend}
            disabled={!input.trim()}
          >
            Send
          </Button>
        </div>

        {/* Quick Actions */}
        {messages.length === 0 && suggestions.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {suggestions.slice(3, 6).map((suggestion, i) => (
              <button
                key={i}
                onClick={() => setInput(suggestion)}
                className="px-3 py-1 text-xs bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
