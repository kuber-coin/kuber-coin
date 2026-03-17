'use client';

import { useState } from 'react';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { ABIFunction } from '@/services/abiParser';

interface ContractCallProps {
  contractAddress: string;
  functions: ABIFunction[];
  onExecuteAction: (functionName: string, parameters: any[]) => void;
}

export function ContractCall({ contractAddress, functions, onExecuteAction }: ContractCallProps) {
  const [selectedFunction, setSelectedFunction] = useState<ABIFunction | null>(null);
  const [parameters, setParameters] = useState<{ [key: string]: any }>({});
  const [gasEstimate, setGasEstimate] = useState<number | null>(null);

  const handleFunctionSelect = (func: ABIFunction) => {
    setSelectedFunction(func);
    setParameters({});
    setGasEstimate(Math.floor(Math.random() * 50000 + 21000));
  };

  const handleParameterChange = (paramName: string, value: any) => {
    setParameters(prev => ({ ...prev, [paramName]: value }));
  };

  const handleExecute = () => {
    if (!selectedFunction) return;

    const paramValues = selectedFunction.inputs.map(input => parameters[input.name] || '');
    onExecuteAction(selectedFunction.name, paramValues);
  };

  const getInputType = (paramType: string): string => {
    if (paramType.startsWith('uint') || paramType.startsWith('int')) return 'number';
    if (paramType === 'bool') return 'checkbox';
    return 'text';
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Function
          </label>
          <select
            onChange={(e) => {
              const func = functions.find(f => f.name === e.target.value);
              if (func) handleFunctionSelect(func);
            }}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg"
          >
            <option value="">Choose a function...</option>
            {functions.map((func, index) => (
              <option key={index} value={func.name}>
                {func.name}({func.inputs.map(i => i.type).join(', ')})
                {func.stateMutability === 'view' && ' [view]'}
                {func.stateMutability === 'pure' && ' [pure]'}
                {func.stateMutability === 'payable' && ' [payable]'}
              </option>
            ))}
          </select>
        </div>

        {selectedFunction && (
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="font-semibold mb-2">{selectedFunction.name}</h4>
              <div className="text-sm text-gray-600">
                <div>State: {selectedFunction.stateMutability}</div>
                <div>Inputs: {selectedFunction.inputs.length}</div>
                <div>Outputs: {selectedFunction.outputs.length}</div>
              </div>
            </div>

            {selectedFunction.inputs.length > 0 && (
              <div className="space-y-3">
                <h5 className="font-medium">Parameters</h5>
                {selectedFunction.inputs.map((input, index) => (
                  <div key={index}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {input.name || `param${index}`} ({input.type})
                    </label>
                    {input.type === 'bool' ? (
                      <input
                        type="checkbox"
                        checked={parameters[input.name] || false}
                        onChange={(e) => handleParameterChange(input.name, e.target.checked)}
                        className="w-4 h-4"
                      />
                    ) : (
                      <input
                        type={getInputType(input.type)}
                        value={parameters[input.name] || ''}
                        onChange={(e) => handleParameterChange(input.name, e.target.value)}
                        placeholder={`Enter ${input.type}`}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                      />
                    )}
                  </div>
                ))}
              </div>
            )}

            {gasEstimate && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="text-sm">
                  <span className="text-gray-600">Estimated Gas:</span>
                  <span className="font-semibold ml-2">{gasEstimate.toLocaleString()}</span>
                </div>
              </div>
            )}

            <Button
              variant="primary"
              onClick={handleExecute}
              className="w-full"
              disabled={!selectedFunction}
            >
              {selectedFunction.stateMutability === 'view' || selectedFunction.stateMutability === 'pure'
                ? '🔍 Call (Read)'
                : '✍️ Send Transaction (Write)'}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
