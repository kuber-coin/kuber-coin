// Smart Contract Interaction Service
// Interact with smart contracts

export interface ContractABI {
  name: string;
  type: 'function' | 'event' | 'constructor';
  inputs: { name: string; type: string }[];
  outputs?: { name: string; type: string }[];
  stateMutability?: 'view' | 'pure' | 'nonpayable' | 'payable';
}

export interface SmartContract {
  id: string;
  address: string;
  name: string;
  abi: ContractABI[];
  network: string;
  addedAt: number;
}

export interface ContractCall {
  id: string;
  contractId: string;
  functionName: string;
  params: any[];
  result?: any;
  gasUsed?: number;
  timestamp: number;
  txHash?: string;
  status: 'pending' | 'success' | 'failed';
}

class ContractInteractionService {
  private contracts: Map<string, SmartContract> = new Map();
  private calls: Map<string, ContractCall> = new Map();
  private readonly STORAGE_KEY_CONTRACTS = 'kubercoin_contracts';
  private readonly STORAGE_KEY_CALLS = 'kubercoin_contract_calls';

  private isBrowser(): boolean {
    return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
  }

  constructor() {
    this.loadContracts();
    this.loadCalls();
  }

  private loadContracts() {
    if (!this.isBrowser()) return;
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY_CONTRACTS);
      if (stored) {
        const contracts = JSON.parse(stored);
        contracts.forEach((c: SmartContract) => this.contracts.set(c.id, c));
      }
    } catch {
      // Ignore storage/parse errors
    }
  }

  private saveContracts() {
    if (!this.isBrowser()) return;
    try {
      const contracts = Array.from(this.contracts.values());
      localStorage.setItem(this.STORAGE_KEY_CONTRACTS, JSON.stringify(contracts));
    } catch {
      // Ignore storage write errors
    }
  }

  private loadCalls() {
    if (!this.isBrowser()) return;
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY_CALLS);
      if (stored) {
        const calls = JSON.parse(stored);
        calls.forEach((c: ContractCall) => this.calls.set(c.id, c));
      }
    } catch {
      // Ignore storage/parse errors
    }
  }

  private saveCalls() {
    if (!this.isBrowser()) return;
    try {
      const calls = Array.from(this.calls.values());
      localStorage.setItem(this.STORAGE_KEY_CALLS, JSON.stringify(calls));
    } catch {
      // Ignore storage write errors
    }
  }

  addContract(address: string, name: string, abi: ContractABI[], network: string): SmartContract {
    const contract: SmartContract = {
      id: `contract_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      address,
      name,
      abi,
      network,
      addedAt: Date.now(),
    };

    this.contracts.set(contract.id, contract);
    this.saveContracts();
    return contract;
  }

  getContracts(): SmartContract[] {
    return Array.from(this.contracts.values()).sort((a, b) => b.addedAt - a.addedAt);
  }

  getContract(id: string): SmartContract | undefined {
    return this.contracts.get(id);
  }

  removeContract(id: string): void {
    this.contracts.delete(id);
    this.saveContracts();
  }

  readContract(contractId: string, functionName: string, params: any[]): ContractCall {
    throw new Error('Contract read requires a configured RPC endpoint.');
  }

  writeContract(contractId: string, functionName: string, params: any[]): ContractCall {
    throw new Error('Contract write requires a configured RPC endpoint.');
  }

  estimateGas(func: ContractABI, params: any[]): number {
    // Simple gas estimation (in production, call actual RPC)
    let baseGas = 21000;
    
    if (func.stateMutability === 'payable') baseGas += 10000;
    baseGas += params.length * 5000;
    
    return baseGas;
  }

  getCalls(contractId?: string): ContractCall[] {
    let calls = Array.from(this.calls.values());
    
    if (contractId) {
      calls = calls.filter((c) => c.contractId === contractId);
    }
    
    return calls.sort((a, b) => b.timestamp - a.timestamp);
  }

  parseABI(abiJson: string): ContractABI[] {
    try {
      return JSON.parse(abiJson);
    } catch (error) {
      throw new Error('Invalid ABI JSON');
    }
  }
}

const contractInteractionService = new ContractInteractionService();
export default contractInteractionService;
