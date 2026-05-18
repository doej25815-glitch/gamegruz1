export const CHECK_IN_CONTRACT_ADDRESS = "0x3eA543f176E17c1dC84D76bF548d7c95A85BdA1f" as const;

export const CHECK_IN_PRICE_ETH = "0.00001";
export const CHECK_IN_INTERVAL_SECONDS = 120;
export const BASE_BUILDER_CODE = "bc_orvodcta";
export const BASE_BUILDER_CODE_DATA_SUFFIX =
  "0x62635f6f72766f646374610b0080218021802180218021802180218021" as const;

export const checkInAbi = [
  {
    type: "function",
    name: "checkIn",
    inputs: [],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "canCheckIn",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getPlayer",
    inputs: [{ name: "account", type: "address" }],
    outputs: [
      { name: "lastCheckInAt", type: "uint256" },
      { name: "streak", type: "uint256" },
      { name: "totalCheckIns", type: "uint256" },
      { name: "totalPaid", type: "uint256" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "secondsUntilNextCheckIn",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "tapMultiplierBps",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;
