export const EVIL_SQUIRREL_CHECKIN_PRICE_ETH = "0.00001";
export const EVIL_SQUIRREL_CHECKIN_INTERVAL_SECONDS = 120;

// После деплоя в Remix замени на новый адрес EvilSquirrelOnchain:
export const EVIL_SQUIRREL_CONTRACT_ADDRESS =
  "0x0000000000000000000000000000000000000000" as const;

export const EVIL_SQUIRREL_BUILDER_CODE = "bc_orvodcta";
export const EVIL_SQUIRREL_BUILDER_CODE_DATA_SUFFIX =
  "0x62635f6f72766f646374610b0080218021802180218021802180218021" as const;

export const evilSquirrelOnchainAbi = [
  {
    inputs: [{ internalType: "uint256", name: "tapsCount", type: "uint256" }],
    name: "tap",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "checkIn",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "player", type: "address" }],
    name: "getPlayer",
    outputs: [
      { internalType: "uint256", name: "score", type: "uint256" },
      { internalType: "uint256", name: "streak", type: "uint256" },
      { internalType: "uint256", name: "lastCheckinSlot", type: "uint256" },
      { internalType: "bool", name: "canCheckin", type: "bool" },
      { internalType: "uint256", name: "totalCheckins", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "player", type: "address" }],
    name: "canCheckInNow",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export function withEvilSquirrelBuilderCodeDataSuffix(data: `0x${string}`): `0x${string}` {
  return `${data}${EVIL_SQUIRREL_BUILDER_CODE_DATA_SUFFIX.slice(2)}` as `0x${string}`;
}

export function getEvilSquirrelContractAddress(): `0x${string}` {
  return EVIL_SQUIRREL_CONTRACT_ADDRESS;
}
