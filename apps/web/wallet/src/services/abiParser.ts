// abiParser.ts - ABI JSON parsing and function signature generation

export interface ABIFunction {
  name: string;
  type: 'function' | 'constructor' | 'fallback' | 'receive';
  inputs: ABIParameter[];
  outputs: ABIParameter[];
  stateMutability: 'pure' | 'view' | 'nonpayable' | 'payable';
}

export interface ABIEvent {
  name: string;
  type: 'event';
  inputs: ABIParameter[];
  anonymous: boolean;
}

export interface ABIParameter {
  name: string;
  type: string;
  indexed?: boolean;
  components?: ABIParameter[];
}

class ABIParser {
  parseABI(abiJson: string): { functions: ABIFunction[]; events: ABIEvent[] } {
    try {
      const abi = JSON.parse(abiJson);
      
      const functions: ABIFunction[] = [];
      const events: ABIEvent[] = [];

      for (const item of abi) {
        if (item.type === 'function' || item.type === 'constructor') {
          functions.push(item as ABIFunction);
        } else if (item.type === 'event') {
          events.push(item as ABIEvent);
        }
      }

      return { functions, events };
    } catch (error) {
      throw new Error('Invalid ABI JSON');
    }
  }

  generateFunctionSignature(func: ABIFunction): string {
    const params = func.inputs.map(p => p.type).join(',');
    return `${func.name}(${params})`;
  }

  generateEventSignature(event: ABIEvent): string {
    const params = event.inputs.map(p => p.type).join(',');
    return `${event.name}(${params})`;
  }

  getParameterType(type: string): 'address' | 'uint' | 'int' | 'bool' | 'string' | 'bytes' | 'array' | 'tuple' {
    if (type.startsWith('address')) return 'address';
    if (type.startsWith('uint')) return 'uint';
    if (type.startsWith('int')) return 'int';
    if (type === 'bool') return 'bool';
    if (type === 'string') return 'string';
    if (type.startsWith('bytes')) return 'bytes';
    if (type.endsWith('[]')) return 'array';
    if (type.startsWith('tuple')) return 'tuple';
    return 'bytes';
  }

  validateParameterValue(type: string, value: any): boolean {
    const baseType = this.getParameterType(type);

    switch (baseType) {
      case 'address':
        return typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value);
      case 'uint':
      case 'int':
        return !isNaN(Number(value));
      case 'bool':
        return value === true || value === false || value === 'true' || value === 'false';
      case 'string':
        return typeof value === 'string';
      case 'array':
        return Array.isArray(value);
      default:
        return true;
    }
  }

  encodeParameters(func: ABIFunction, values: any[]): string {
    if (values.length !== func.inputs.length) {
      throw new Error('Parameter count mismatch');
    }

    for (let i = 0; i < func.inputs.length; i++) {
      if (!this.validateParameterValue(func.inputs[i].type, values[i])) {
        throw new Error(`Invalid value for parameter ${func.inputs[i].name}`);
      }
    }

    throw new Error('ABI encoding requires a real ABI encoder (e.g., ethers.js).');
  }

  decodeParameters(outputs: ABIParameter[], data: string): any[] {
    if (!data) {
      throw new Error('No data to decode');
    }

    throw new Error('ABI decoding requires a real ABI decoder (e.g., ethers.js).');
  }

  formatParameterValue(type: string, value: any): string {
    const baseType = this.getParameterType(type);

    switch (baseType) {
      case 'uint':
      case 'int':
        return BigInt(value).toString();
      case 'address':
        return value.toLowerCase();
      case 'bool':
        return String(value);
      case 'array':
        return JSON.stringify(value);
      default:
        return String(value);
    }
  }
}

const abiParser = new ABIParser();
export default abiParser;