const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
  console.log("Deploying HPP Custody Staking contract...");

  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

  // ============================================
  // Configuration - Load from environment variables
  // ============================================
  
  // HPP Token contract address (required)
  const HPP_TOKEN_ADDRESS = process.env.HPP_TOKEN_ADDRESS;
  if (!HPP_TOKEN_ADDRESS) {
    throw new Error("HPP_TOKEN_ADDRESS is not set in .env file");
  }
  
  // Custody wallet address (required) - This wallet will hold the staked tokens
  const CUSTODY_WALLET = process.env.CUSTODY_WALLET;
  if (!CUSTODY_WALLET) {
    throw new Error("CUSTODY_WALLET is not set in .env file");
  }
  
  // Cooldown duration in seconds (required)
  const COOLDOWN_DURATION = 7 * 24 * 60 * 60; // Default: 7 days (604800 seconds)

  console.log("\n=== Deployment Configuration ===");
  console.log("HPP Token Address:", HPP_TOKEN_ADDRESS);
  console.log("Custody Wallet:", CUSTODY_WALLET);
  console.log("Cooldown Duration:", COOLDOWN_DURATION, "seconds (" + (COOLDOWN_DURATION / (24 * 60 * 60)).toFixed(1) + " days)");
  console.log("Owner (Deployer):", deployer.address);
  console.log("===============================\n");

  // ============================================
  // Deploy Contract
  // ============================================
  const HPPCustodyStaking = await ethers.getContractFactory("HPPCustodyStaking");
  
  console.log("Deploying contract...");
  const stakingContract = await HPPCustodyStaking.deploy(
    HPP_TOKEN_ADDRESS,
    CUSTODY_WALLET,
    COOLDOWN_DURATION
  );

  await stakingContract.waitForDeployment();
  const contractAddress = await stakingContract.getAddress();
  
  console.log("\n=== Deployment Successful ===");
  console.log("HPP Custody Staking deployed to:", contractAddress);
  console.log("============================\n");

  // ============================================
  // Verify Contract State
  // ============================================
  console.log("=== Contract State ===");
  console.log("Staking Token:", await stakingContract.stakingToken());
  console.log("Custody Wallet:", await stakingContract.custodyWallet());
  console.log("Cooldown Duration:", (await stakingContract.cooldownDuration()).toString(), "seconds");
  console.log("Owner:", await stakingContract.owner());
  console.log("Max Global Cooldown Entries:", (await stakingContract.maxGlobalCooldownEntries()).toString());
  console.log("Total Staked:", ethers.formatEther(await stakingContract.totalStaked()), "HPP");
  console.log("======================\n");

  // ============================================
  // Post-Deployment Instructions
  // ============================================
  console.log("=== Post-Deployment Checklist ===");
  console.log("1. Verify the contract on block explorer:");
  console.log("   npx hardhat verify --network <network>", contractAddress, HPP_TOKEN_ADDRESS, CUSTODY_WALLET, COOLDOWN_DURATION);
  console.log("\n2. Custody wallet must approve this contract to transfer tokens:");
  console.log("   stakingToken.approve(" + contractAddress + ", <amount>)");
  console.log("\n3. Users can now stake tokens by:");
  console.log("   - Approving tokens: stakingToken.approve(" + contractAddress + ", <amount>)");
  console.log("   - Staking: stake(<amount>)");
  console.log("\n4. To change custody wallet (two-step process):");
  console.log("   - Owner: proposeCustodyWallet(<newCustody>)");
  console.log("   - New Custody: acceptCustodyWallet()");
  console.log("===================================\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

