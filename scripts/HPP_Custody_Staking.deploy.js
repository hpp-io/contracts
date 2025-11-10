const { ethers } = require("hardhat");

async function main() {
  console.log("Deploying HPP Custody Staking contract...");

  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

  // ============================================
  // Configuration - Update these values before deployment
  // ============================================
  
  // HPP Token contract address (required)
  const HPP_TOKEN_ADDRESS = "0x8ebCaf48D2D91b8CEcF1668A4519823881Bf8fc3"; // Enter the deployed HPP token address
  
  // Custody wallet address (required) - This wallet will hold the staked tokens
  const CUSTODY_WALLET = "0x662c813ff91445b94c32b139ea8ce93a160b9c8b"; // Enter the custody wallet address
  
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

