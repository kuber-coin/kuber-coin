'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import contractInteractionService, { SmartContract } from '@/services/contractInteraction';
import abiParser, { ABIFunction } from '@/services/abiParser';
import { ContractCall } from '@/components/ContractCall';
import { EventMonitor } from '@/components/EventMonitor';

export default function ContractsPage() {
  const [contracts, setContracts] = useState<SmartContract[]>([]);
  const [selectedContract, setSelectedContract] = useState<SmartContract | null>(null);
  const [functions, setFunctions] = useState<ABIFunction[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [showImport, setShowImport] = useState(false);
  const [importAddress, setImportAddress] = useState('');
  const [importABI, setImportABI] = useState('');
  const [importName, setImportName] = useState('');

  useEffect(() => {
    loadContracts();
  }, []);

  useEffect(() => {
    if (selectedContract) {
      loadContractData();
    }
  }, [selectedContract]);

  const loadContracts = () => {
    const allContracts = contractInteractionService.getContracts();
    setContracts(allContracts);
  };

  const loadContractData = () => {
    if (!selectedContract) return;

    try {
      const parsed = abiParser.parseABI(JSON.stringify(selectedContract.abi));
      setFunctions(parsed.functions);
      
      // Events functionality not yet implemented
      setEvents([]);
    } catch (error) {
      console.error('Error loading contract data:', error);
    }
  };

  const handleImportContract = async () => {
    try {
      const abi = JSON.parse(importABI);
      const contract = contractInteractionService.addContract(
        importAddress,
        importName || 'Unnamed Contract',
        abi,
        'mainnet'
      );
      
      setContracts([...contracts, contract]);
      setShowImport(false);
      setImportAddress('');
      setImportABI('');
      setImportName('');
      alert('Contract imported successfully!');
    } catch (error: any) {
      alert(`Error importing contract: ${error.message}`);
    }
  };

  const handleExecuteFunction = async (functionName: string, parameters: any[]) => {
    if (!selectedContract) return;

    try {
      const result = contractInteractionService.writeContract(
        selectedContract.id,
        functionName,
        parameters
      );
      
      alert(`Function executed successfully!\nTx Hash: ${result.txHash || 'pending'}\nResult: ${JSON.stringify(result.result || 'pending')}`);
      loadContractData();
    } catch (error: any) {
      alert(`Error executing function: ${error.message}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Smart Contracts</h1>
          <p className="text-gray-600 mt-1">Interact with deployed smart contracts</p>
        </div>
        <Button variant="primary" onClick={() => setShowImport(true)}>
          ➕ Import Contract
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="p-6">
          <div className="text-sm text-gray-600 mb-1">Total Contracts</div>
          <div className="text-3xl font-bold">{contracts.length}</div>
        </Card>

        <Card className="p-6">
          <div className="text-sm text-gray-600 mb-1">Active Contract</div>
          <div className="text-xl font-bold text-blue-600 truncate">
            {selectedContract?.name || 'None'}
          </div>
        </Card>

        <Card className="p-6">
          <div className="text-sm text-gray-600 mb-1">Events Monitored</div>
          <div className="text-3xl font-bold text-green-600">{events.length}</div>
        </Card>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Left: Contract List */}
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Your Contracts</h2>

          {contracts.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <div className="text-4xl mb-2">📄</div>
              <p className="mb-4">No contracts imported</p>
              <Button variant="primary" onClick={() => setShowImport(true)} className="mx-auto">
                Import Contract
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {contracts.map((contract) => (
                <Card
                  key={contract.id}
                  className={`p-4 cursor-pointer transition-all ${
                    selectedContract?.id === contract.id
                      ? 'border-2 border-blue-500 bg-blue-50'
                      : 'hover:border-gray-300'
                  }`}
                  onClick={() => setSelectedContract(contract)}
                >
                  <h3 className="font-semibold mb-1">{contract.name}</h3>
                  <p className="text-xs font-mono text-gray-600 break-all">
                    {contract.address.substring(0, 20)}...
                  </p>
                  <div className="text-xs text-gray-500 mt-2">
                    {new Date(contract.addedAt).toLocaleDateString()}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </Card>

        {/* Middle: Contract Interaction */}
        <div className="space-y-4">
          {selectedContract ? (
            <>
              <Card className="p-6">
                <h3 className="text-xl font-semibold mb-4">Contract Details</h3>
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="text-gray-600">Name:</span>
                    <span className="font-semibold ml-2">{selectedContract.name}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Address:</span>
                    <p className="font-mono text-xs break-all mt-1">{selectedContract.address}</p>
                  </div>
                  <div>
                    <span className="text-gray-600">Functions:</span>
                    <span className="font-semibold ml-2">{functions.length}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Added:</span>
                    <span className="ml-2">{new Date(selectedContract.addedAt).toLocaleDateString()}</span>
                  </div>
                </div>
              </Card>

              <ContractCall
                contractAddress={selectedContract.address}
                functions={functions}
                onExecuteAction={handleExecuteFunction}
              />
            </>
          ) : (
            <Card className="p-6 text-center text-gray-500">
              <div className="text-4xl mb-2">👈</div>
              <p>Select a contract to interact with it</p>
            </Card>
          )}
        </div>

        {/* Right: Events */}
        <div>
          {selectedContract && (
            <EventMonitor
              events={events}
              onRefreshAction={loadContractData}
            />
          )}
        </div>
      </div>

      {/* Import Modal */}
      {showImport && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-2xl">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold">Import Contract</h2>
                <button onClick={() => setShowImport(false)} className="text-gray-500 hover:text-gray-700">
                  ✕
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Contract Name (optional)
                  </label>
                  <input
                    type="text"
                    value={importName}
                    onChange={(e) => setImportName(e.target.value)}
                    placeholder="My Token Contract"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Contract Address
                  </label>
                  <input
                    type="text"
                    value={importAddress}
                    onChange={(e) => setImportAddress(e.target.value)}
                    placeholder="0x..."
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg font-mono"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Contract ABI (JSON)
                  </label>
                  <textarea
                    value={importABI}
                    onChange={(e) => setImportABI(e.target.value)}
                    placeholder='[{"name":"transfer","type":"function",...}]'
                    rows={10}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg font-mono text-sm"
                  />
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-sm text-blue-800">
                    💡 <strong>Tip:</strong> You can get the ABI from Etherscan or your contract compilation output.
                  </p>
                </div>

                <div className="flex space-x-3">
                  <Button
                    variant="secondary"
                    onClick={() => setShowImport(false)}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    onClick={handleImportContract}
                    className="flex-1"
                    disabled={!importAddress || !importABI}
                  >
                    Import Contract
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
