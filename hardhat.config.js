require("@nomicfoundation/hardhat-toolbox");
require("@nomicfoundation/hardhat-verify");
require("dotenv").config();

const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const MAINNET_RPC_URL = process.env.MAINNET_RPC_URL || "";
const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL || "";
const HPP_SEPOLIA_RPC_URL = process.env.HPP_SEPOLIA_RPC_URL || "";
const HPP_MAINNET_RPC_URL = process.env.HPP_MAINNET_RPC_URL || "";

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "";
const ETHERSCAN_API_MAINNET_URL = "https://api.etherscan.io/api";
const ETHERSCAN_API_SEPOLIA_URL = "https://api-sepolia.etherscan.io/api";

module.exports = {
  solidity: "0.8.28",
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
  },
  etherscan: {
    apiKey: {
        sepolia: ETHERSCAN_API_KEY,
        mainnet: ETHERSCAN_API_KEY
    },
    url: {
      sepolia: ETHERSCAN_API_SEPOLIA_URL,
      mainnet: ETHERSCAN_API_MAINNET_URL
    }
  },
  sourcify: {
    enabled: true
  }
};
