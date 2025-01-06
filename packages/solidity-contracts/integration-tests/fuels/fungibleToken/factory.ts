import type {
  StorageSlot,
  InvokeFunction,
  BigNumberish,
  AbstractAddress,
  Account,
  Provider,
  DeployContractOptions,
  DeployContractResult,
  StdString,
  BN,
  Bytes,
  FunctionFragment,
} from 'fuels';
import { Contract, Interface, ContractFactory } from 'fuels';

type Option<T> = T | undefined;

type Enum<T> = {
  [K in keyof T]: Pick<T, K> & { [P in Exclude<keyof T, K>]?: never };
}[keyof T];

type MetadataOutput = Enum<{
  B256: string;
  Bytes: Bytes;
  Int: BN;
  String: StdString;
}>;
type AssetIdInput = {
  bits: string;
};

type IdentityInput = Enum<{
  Address: AddressInput;
  ContractId: ContractIdInput;
}>;
type IdentityOutput = Enum<{
  Address: AddressOutput;
  ContractId: ContractIdOutput;
}>;
type StateOutput = Enum<{
  Uninitialized: void;
  Initialized: IdentityOutput;
  Revoked: void;
}>;
type AddressInput = {
  bits: string;
};
type AddressOutput = AddressInput;
type ContractIdInput = {
  bits: string;
};
type ContractIdOutput = ContractIdInput;

declare class ProxyInterface extends Interface {
  constructor();
  functions: {
    proxy_target: FunctionFragment;
    set_proxy_target: FunctionFragment;
    _proxy_change_owner: FunctionFragment;
    _proxy_owner: FunctionFragment;
    _proxy_revoke_ownership: FunctionFragment;
  };
}
declare class Proxy extends Contract {
  static readonly abi: {
    programType: string;
    specVersion: string;
    encodingVersion: string;
    concreteTypes: (
      | {
          type: string;
          concreteTypeId: string;
          metadataTypeId?: undefined;
          typeArguments?: undefined;
        }
      | {
          type: string;
          concreteTypeId: string;
          metadataTypeId: number;
          typeArguments?: undefined;
        }
      | {
          type: string;
          concreteTypeId: string;
          metadataTypeId: number;
          typeArguments: string[];
        }
    )[];
    metadataTypes: (
      | {
          type: string;
          metadataTypeId: number;
          components?: undefined;
          typeParameters?: undefined;
        }
      | {
          type: string;
          metadataTypeId: number;
          components: (
            | {
                name: string;
                typeId: string;
              }
            | {
                name: string;
                typeId: number;
              }
          )[];
          typeParameters?: undefined;
        }
      | {
          type: string;
          metadataTypeId: number;
          components: (
            | {
                name: string;
                typeId: string;
              }
            | {
                name: string;
                typeId: number;
              }
          )[];
          typeParameters: number[];
        }
    )[];
    functions: {
      inputs: {
        name: string;
        concreteTypeId: string;
      }[];
      name: string;
      output: string;
      attributes: {
        name: string;
        arguments: string[];
      }[];
    }[];
    loggedTypes: {
      logId: string;
      concreteTypeId: string;
    }[];
    messagesTypes: never[];
    configurables: {
      name: string;
      concreteTypeId: string;
      offset: number;
    }[];
  };

  static readonly storageSlots: StorageSlot[];
  interface: ProxyInterface;
  functions: {
    proxy_target: InvokeFunction<[], Option<ContractIdOutput>>;
    set_proxy_target: InvokeFunction<[new_target: ContractIdInput], void>;
    _proxy_change_owner: InvokeFunction<[new_owner: IdentityInput], void>;
    _proxy_owner: InvokeFunction<[], StateOutput>;
    _proxy_revoke_ownership: InvokeFunction<[], void>;
  };
  constructor(
    id: string | AbstractAddress,
    accountOrProvider: Account | Provider
  );
}

declare class ProxyFactory extends ContractFactory {
  static readonly bytecode: Uint8Array;
  constructor(accountOrProvider: Account | Provider);
  deploy<TContract extends Contract = Contract>(
    deployOptions?: DeployContractOptions
  ): Promise<DeployContractResult<TContract>>;
  static deploy(
    wallet: Account,
    options?: DeployContractOptions
  ): Promise<DeployContractResult<Proxy>>;
}

declare class BridgeFungibleTokenInterface extends Interface {
  constructor();
  functions: {
    process_message: FunctionFragment;
    asset_to_l1_address: FunctionFragment;
    asset_to_sub_id: FunctionFragment;
    bridged_token_gateway: FunctionFragment;
    claim_refund: FunctionFragment;
    withdraw: FunctionFragment;
    decimals: FunctionFragment;
    name: FunctionFragment;
    symbol: FunctionFragment;
    total_assets: FunctionFragment;
    total_supply: FunctionFragment;
    metadata: FunctionFragment;
  };
}

declare class BridgeFungibleToken extends Contract {
  static readonly abi: {
    programType: string;
    specVersion: string;
    encodingVersion: string;
    concreteTypes: (
      | {
          type: string;
          concreteTypeId: string;
          metadataTypeId?: undefined;
          typeArguments?: undefined;
        }
      | {
          type: string;
          concreteTypeId: string;
          metadataTypeId: number;
          typeArguments?: undefined;
        }
      | {
          type: string;
          concreteTypeId: string;
          metadataTypeId: number;
          typeArguments: string[];
        }
    )[];
    metadataTypes: (
      | {
          type: string;
          metadataTypeId: number;
          components: (
            | {
                name: string;
                typeId: string;
              }
            | {
                name: string;
                typeId: number;
              }
          )[];
          typeParameters?: undefined;
        }
      | {
          type: string;
          metadataTypeId: number;
          components: (
            | {
                name: string;
                typeId: string;
              }
            | {
                name: string;
                typeId: number;
              }
          )[];
          typeParameters: number[];
        }
      | {
          type: string;
          metadataTypeId: number;
          components?: undefined;
          typeParameters?: undefined;
        }
      | {
          type: string;
          metadataTypeId: number;
          components: (
            | {
                name: string;
                typeId: number;
                typeArguments?: undefined;
              }
            | {
                name: string;
                typeId: number;
                typeArguments: {
                  name: string;
                  typeId: number;
                }[];
              }
          )[];
          typeParameters?: undefined;
        }
    )[];
    functions: (
      | {
          inputs: {
            name: string;
            concreteTypeId: string;
          }[];
          name: string;
          output: string;
          attributes: {
            name: string;
            arguments: string[];
          }[];
        }
      | {
          inputs: never[];
          name: string;
          output: string;
          attributes: null;
        }
    )[];
    loggedTypes: {
      logId: string;
      concreteTypeId: string;
    }[];
    messagesTypes: never[];
    configurables: {
      name: string;
      concreteTypeId: string;
      offset: number;
    }[];
  };

  static readonly storageSlots: StorageSlot[];
  interface: BridgeFungibleTokenInterface;
  functions: {
    process_message: InvokeFunction<[msg_idx: BigNumberish], void>;
    asset_to_l1_address: InvokeFunction<[asset_id: AssetIdInput], string>;
    asset_to_sub_id: InvokeFunction<[asset_id: AssetIdInput], string>;
    bridged_token_gateway: InvokeFunction<[], string>;
    claim_refund: InvokeFunction<
      [from: string, token_address: string, token_id: string],
      void
    >;
    withdraw: InvokeFunction<[to: string], void>;
    decimals: InvokeFunction<[asset: AssetIdInput], Option<number>>;
    name: InvokeFunction<[asset: AssetIdInput], Option<StdString>>;
    symbol: InvokeFunction<[asset: AssetIdInput], Option<StdString>>;
    total_assets: InvokeFunction<[], BN>;
    total_supply: InvokeFunction<[asset: AssetIdInput], Option<BN>>;
    metadata: InvokeFunction<
      [asset: AssetIdInput, key: StdString],
      Option<MetadataOutput>
    >;
  };
  constructor(
    id: string | AbstractAddress,
    accountOrProvider: Account | Provider
  );
}

declare class BridgeFungibleTokenFactory extends ContractFactory {
  static readonly bytecode: Uint8Array;
  constructor(accountOrProvider: Account | Provider);
  deploy<TContract extends Contract = Contract>(
    deployOptions?: DeployContractOptions
  ): Promise<DeployContractResult<TContract>>;
  static deploy(
    wallet: Account,
    options?: DeployContractOptions
  ): Promise<DeployContractResult<BridgeFungibleToken>>;
}

export { BridgeFungibleToken, BridgeFungibleTokenFactory, Proxy, ProxyFactory };
