require("@nomicfoundation/hardhat-toolbox");
require("@nomicfoundation/hardhat-verify");
require("dotenv").config();

const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const MAINNET_RPC_URL = process.env.MAINNET_RPC_URL || "";
const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL || "";
const HPP_SEPOLIA_RPC_URL = process.env.HPP_SEPOLIA_RPC_URL || "";
const HPP_MAINNET_RPC_URL = process.env.HPP_MAINNET_RPC_URL || "";
// Base (HPP is bridged from Ethereum through the Base standard bridge). Public RPCs are the default.
const BASE_SEPOLIA_RPC_URL = process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
const BASE_MAINNET_RPC_URL = process.env.BASE_MAINNET_RPC_URL || "https://mainnet.base.org";

// Only include an account when it looks like a 32-byte hex private key.
// Accepts both "0x..."-prefixed (66 chars) and bare 64-char forms.
// Avoids "private key too short" config-validation errors when a key is
// not configured for a network that isn't being used.
const normalizeKey = (k) =>
  typeof k === "string" && /^(0x)?[0-9a-fA-F]{64}$/.test(k)
    ? (k.startsWith("0x") ? k : "0x" + k)
    : null;
const accountsOf = (k) => {
  const n = normalizeKey(k);
  return n ? [n] : [];
};

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "";
const ETHERSCAN_API_MAINNET_URL = "https://api.etherscan.io/api";
const ETHERSCAN_API_SEPOLIA_URL = "https://api-sepolia.etherscan.io/api";

module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    mainnet: {
      url: MAINNET_RPC_URL,
      accounts: [PRIVATE_KEY],
      gasPrice: "auto"
    },
    sepolia: {
      url: SEPOLIA_RPC_URL,
      accounts: [PRIVATE_KEY]
    },
    hpp_sepolia: {
      url: HPP_SEPOLIA_RPC_URL,
      accounts: [PRIVATE_KEY]
    },
    hpp_mainnet: {
      url: HPP_MAINNET_RPC_URL,
      accounts: [PRIVATE_KEY]
    },
    base_sepolia: {
      url: BASE_SEPOLIA_RPC_URL,
      chainId: 84532,
      accounts: accountsOf(PRIVATE_KEY)
    },
    base: {
      url: BASE_MAINNET_RPC_URL,
      chainId: 8453,
      accounts: accountsOf(PRIVATE_KEY)
    },
  },
  etherscan: {
    apiKey: {
        sepolia: ETHERSCAN_API_KEY,
        mainnet: ETHERSCAN_API_KEY,
        hpp_sepolia: ETHERSCAN_API_KEY,
        hpp_mainnet: ETHERSCAN_API_KEY
    },
    customChains: [
      {
        network: "hpp_sepolia",
        chainId: 181228,
        urls: {
          apiURL: process.env.HPP_SEPOLIA_EXPLORER_API_URL,
          browserURL: process.env.HPP_SEPOLIA_EXPLORER_URL
        }
      },
      {
        network: "hpp_mainnet",
        chainId: 190415,
        urls: {
          apiURL: process.env.HPP_MAINNET_EXPLORER_API_URL,
          browserURL: process.env.HPP_MAINNET_EXPLORER_URL
        }
      }
    ]
  },
  sourcify: {
    enabled: true
  }
};
