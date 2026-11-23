const { ethers } = require("ethers");

/**
 * Shared config for bridging HPP (Ethereum) to Base through the Base standard bridge.
 *
 * Flow:
 *   1. HPP_Base_Bridge.createL2Token.js  (on Base)      create the L2 HPP once
 *   2. HPP_Base_Bridge.deposit.js        (on Ethereum)  lock L1 HPP, mint L2 HPP
 *   3. HPP_Base_Bridge.withdraw.js       (on Base)      burn L2 HPP, start the withdrawal
 *
 * The L2 token is created by the OptimismMintableERC20Factory predeploy, which
 * produces a token with EIP-2612 permit. Its address is deterministic for the
 * exact name / symbol / decimals below, so those values must not change.
 */

const TOKEN_NAME = "HousePartyProtocol";
const TOKEN_SYMBOL = "HPP";
const TOKEN_DECIMALS = 18;

// Predeploys, same address on Base and Base Sepolia.
const L2_STANDARD_BRIDGE = "0x4200000000000000000000000000000000000010";
const L2_TOKEN_FACTORY = "0x4200000000000000000000000000000000000012";

// Gas forwarded to the bridge's finalize call on the other chain.
const DEFAULT_MIN_GAS_LIMIT = 200000;

const PAIRS = {
  testnet: {
    label: "Sepolia <-> Base Sepolia",
    isMainnet: false,
    l1ChainId: 11155111n,
    l2ChainId: 84532n,
    l1Token: "0xB34e0d1fee60e078D611D4218AFB004b639C7b76",
    l1Bridge: "0xfd0Bf71F60660E2f608ed56e1659C450eB113120",
    l2Token: "0x6562A6ea4F5B1e4293eD0E6146f6Def41f963305",
    l1RpcUrl: () => process.env.SEPOLIA_RPC_URL,
    l2RpcUrl: () => process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
  },
  mainnet: {
    label: "Ethereum <-> Base",
    isMainnet: true,
    l1ChainId: 1n,
    l2ChainId: 8453n,
    l1Token: "0xe33fbE7584EB79e2673abe576B7AC8C0De62565c",
    l1Bridge: "0x3154Cf16ccdb4C6d922629664174b904d80F2C35",
    l2Token: "0xE9BB73eD2EC7B9F0BE463ce8aF24f2cF0ae7CCE6",
    l1RpcUrl: () => process.env.MAINNET_RPC_URL,
    l2RpcUrl: () => process.env.BASE_MAINNET_RPC_URL || "https://mainnet.base.org",
  },
};

const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function paused() view returns (bool)",
];

const L2_TOKEN_ABI = [
  ...ERC20_ABI,
  "function remoteToken() view returns (address)",
  "function bridge() view returns (address)",
  "function version() view returns (string)",
  "function DOMAIN_SEPARATOR() view returns (bytes32)",
  "function nonces(address) view returns (uint256)",
  "function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)",
];

const FACTORY_ABI = [
  "function createOptimismMintableERC20(address _remoteToken, string _name, string _symbol) returns (address)",
  "function BRIDGE() view returns (address)",
  "event OptimismMintableERC20Created(address indexed localToken, address indexed remoteToken, address deployer)",
];

const BRIDGE_ABI = [
  "function bridgeERC20To(address _localToken, address _remoteToken, address _to, uint256 _amount, uint32 _minGasLimit, bytes _extraData)",
  "function deposits(address, address) view returns (uint256)",
  "function otherBridge() view returns (address)",
  "event ERC20BridgeInitiated(address indexed localToken, address indexed remoteToken, address indexed from, address to, uint256 amount, bytes extraData)",
];

const same = (a, b) => a.toLowerCase() === b.toLowerCase();

/// Picks the token pair for the connected chain and checks it is the expected side ("l1" or "l2").
function pairFor(chainId, side) {
  const id = BigInt(chainId);
  for (const pair of Object.values(PAIRS)) {
    const expected = side === "l1" ? pair.l1ChainId : pair.l2ChainId;
    if (id === expected) {
      if (pair.isMainnet && process.env.ALLOW_MAINNET !== "true") {
        throw new Error(`${pair.label} is mainnet. Set ALLOW_MAINNET=true to run this on mainnet.`);
      }
      return pair;
    }
  }
  const wanted = Object.values(PAIRS)
    .map((p) => (side === "l1" ? p.l1ChainId : p.l2ChainId))
    .join(" or ");
  throw new Error(`Connected to chain ${id}, but this script runs on chain ${wanted}.`);
}

async function requireSigner(hreEthers) {
  const [signer] = await hreEthers.getSigners();
  if (!signer) {
    throw new Error("No signer configured for this network. Set PRIVATE_KEY in .env.");
  }
  return signer;
}

/// Reads AMOUNT (in whole HPP, decimals allowed) from the environment.
function requireAmount() {
  const raw = process.env.AMOUNT;
  if (!raw) throw new Error("AMOUNT environment variable is required (in HPP, e.g. AMOUNT=10).");
  const amount = ethers.parseUnits(raw.replace(/,/g, "").trim(), TOKEN_DECIMALS);
  if (amount <= 0n) throw new Error("AMOUNT must be greater than zero.");
  return amount;
}

function recipientOrDefault(fallback) {
  const raw = process.env.RECIPIENT;
  if (!raw) return fallback;
  if (!ethers.isAddress(raw)) throw new Error(`RECIPIENT is not a valid address: ${raw}`);
  return ethers.getAddress(raw);
}

/// Connects to the other chain of the pair and checks the RPC really is that chain.
async function otherChainProvider(pair, side) {
  const url = side === "l1" ? pair.l1RpcUrl() : pair.l2RpcUrl();
  const expected = side === "l1" ? pair.l1ChainId : pair.l2ChainId;
  if (!url) throw new Error(`RPC URL for the ${side.toUpperCase()} chain of ${pair.label} is not set in .env.`);
  const provider = new ethers.JsonRpcProvider(url);
  const { chainId } = await provider.getNetwork();
  if (chainId !== expected) {
    throw new Error(`The ${side.toUpperCase()} RPC is on chain ${chainId}, expected ${expected}.`);
  }
  return provider;
}

/// Checks the L1 token is the HPP this config expects.
async function verifyL1Token(l1Provider, pair) {
  const token = new ethers.Contract(pair.l1Token, ERC20_ABI, l1Provider);
  const [name, symbol, decimals] = await Promise.all([token.name(), token.symbol(), token.decimals()]);
  if (name !== TOKEN_NAME || symbol !== TOKEN_SYMBOL || Number(decimals) !== TOKEN_DECIMALS) {
    throw new Error(
      `L1 token ${pair.l1Token} is ${name}/${symbol}/${decimals}, expected ${TOKEN_NAME}/${TOKEN_SYMBOL}/${TOKEN_DECIMALS}.`
    );
  }
  return token;
}

/**
 * Checks the L2 token exists and is paired with the L1 HPP through the standard bridge.
 * The L1 bridge accepts any L2 address, so a wrong one leaves the deposit stuck.
 * This check is the only thing that prevents that.
 */
async function verifyL2Token(l2Provider, pair) {
  const code = await l2Provider.getCode(pair.l2Token);
  if (code === "0x") {
    throw new Error(
      `L2 token ${pair.l2Token} does not exist yet. Run HPP_Base_Bridge.createL2Token.js on the Base side first.`
    );
  }
  const token = new ethers.Contract(pair.l2Token, L2_TOKEN_ABI, l2Provider);
  const [remoteToken, bridge, decimals] = await Promise.all([token.remoteToken(), token.bridge(), token.decimals()]);
  if (!same(remoteToken, pair.l1Token)) {
    throw new Error(`L2 token points at L1 token ${remoteToken}, expected ${pair.l1Token}.`);
  }
  if (!same(bridge, L2_STANDARD_BRIDGE)) {
    throw new Error(`L2 token is minted by ${bridge}, expected the L2StandardBridge ${L2_STANDARD_BRIDGE}.`);
  }
  if (Number(decimals) !== TOKEN_DECIMALS) {
    throw new Error(`L2 token has ${decimals} decimals, expected ${TOKEN_DECIMALS}.`);
  }
  return token;
}

module.exports = {
  TOKEN_NAME,
  TOKEN_SYMBOL,
  TOKEN_DECIMALS,
  L2_STANDARD_BRIDGE,
  L2_TOKEN_FACTORY,
  DEFAULT_MIN_GAS_LIMIT,
  PAIRS,
  ERC20_ABI,
  L2_TOKEN_ABI,
  FACTORY_ABI,
  BRIDGE_ABI,
  same,
  pairFor,
  requireSigner,
  requireAmount,
  recipientOrDefault,
  otherChainProvider,
  verifyL1Token,
  verifyL2Token,
};
