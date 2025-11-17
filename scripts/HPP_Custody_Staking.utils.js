const { ethers } = require("hardhat");

/**
 * HPP Custody Staking Contract Utility Scripts
 * 
 * Usage examples:
 *   node scripts/HPP_Custody_Staking.utils.js stake <contractAddress> <amount>
 *   node scripts/HPP_Custody_Staking.utils.js unstake <contractAddress> <amount>
 *   node scripts/HPP_Custody_Staking.utils.js withdraw <contractAddress>
 *   node scripts/HPP_Custody_Staking.utils.js status <contractAddress> [userAddress]
 *   node scripts/HPP_Custody_Staking.utils.js cooldowns <contractAddress> <userAddress>
 */

async function getContract(contractAddress) {
  const [signer] = await ethers.getSigners();
  const contract = await ethers.getContractAt("HPPCustodyStaking", contractAddress, signer);
  return { contract, signer };
}

async function stake(contractAddress, amount) {
  const { contract, signer } = await getContract(contractAddress);
  const tokenAddress = await contract.stakingToken();
  const token = await ethers.getContractAt("IERC20", tokenAddress, signer);
  
  console.log(`\n=== Staking ${ethers.formatEther(amount)} HPP ===`);
  console.log("User:", signer.address);
  console.log("Contract:", contractAddress);
  
  // Check allowance
  const allowance = await token.allowance(signer.address, contractAddress);
  console.log("Current allowance:", ethers.formatEther(allowance), "HPP");
  
  if (allowance < amount) {
    console.log("Approving tokens...");
    const approveTx = await token.approve(contractAddress, amount);
    await approveTx.wait();
    console.log("Approval confirmed");
  }
  
  // Stake
  console.log("Staking tokens...");
  const tx = await contract.stake(amount);
  const receipt = await tx.wait();
  console.log("Transaction hash:", receipt.hash);
  
  // Check new balance
  const stakedBalance = await contract.stakedBalance(signer.address);
  console.log("New staked balance:", ethers.formatEther(stakedBalance), "HPP");
  console.log("=== Staking Complete ===\n");
}

async function unstake(contractAddress, amount) {
  const { contract, signer } = await getContract(contractAddress);
  
  console.log(`\n=== Unstaking ${ethers.formatEther(amount)} HPP ===`);
  console.log("User:", signer.address);
  
  // Check current stake
  const stakedBalance = await contract.stakedBalance(signer.address);
  console.log("Current staked balance:", ethers.formatEther(stakedBalance), "HPP");
  
  // Check cooldown count
  const cooldownCount = await contract.cooldownCount(signer.address);
  const maxEntries = await contract.maxGlobalCooldownEntries();
  console.log("Current cooldown entries:", cooldownCount.toString(), "/", maxEntries.toString());
  
  // Unstake
  console.log("Requesting unstake...");
  const tx = await contract.unstake(amount);
  const receipt = await tx.wait();
  
  // Parse events
  const unstakeEvent = receipt.logs.find(log => {
    try {
      const parsed = contract.interface.parseLog(log);
      return parsed && parsed.name === "UnstakeRequested";
    } catch {
      return false;
    }
  });
  
  if (unstakeEvent) {
    const parsed = contract.interface.parseLog(unstakeEvent);
    const unlockTime = new Date(Number(parsed.args.unlockTime) * 1000);
    console.log("Unstake requested successfully");
    console.log("Unlock time:", unlockTime.toISOString());
  }
  
  console.log("Transaction hash:", receipt.hash);
  console.log("=== Unstaking Complete ===\n");
}

async function withdraw(contractAddress) {
  const { contract, signer } = await getContract(contractAddress);
  
  console.log(`\n=== Withdrawing Tokens ===`);
  console.log("User:", signer.address);
  
  // Check withdrawable amount
  const withdrawable = await contract.withdrawableNow(signer.address);
  console.log("Withdrawable amount:", ethers.formatEther(withdrawable), "HPP");
  
  if (withdrawable === 0n) {
    console.log("No tokens available for withdrawal");
    return;
  }
  
  // Check custody allowance
  const custodyWallet = await contract.custodyWallet();
  const tokenAddress = await contract.stakingToken();
  const token = await ethers.getContractAt("IERC20", tokenAddress);
  const allowance = await token.allowance(custodyWallet, contractAddress);
  console.log("Custody allowance:", ethers.formatEther(allowance), "HPP");
  
  // Withdraw
  console.log("Withdrawing tokens...");
  const tx = await contract.withdraw();
  const receipt = await tx.wait();
  
  // Parse events
  const withdrawEvent = receipt.logs.find(log => {
    try {
      const parsed = contract.interface.parseLog(log);
      return parsed && parsed.name === "Withdrawn";
    } catch {
      return false;
    }
  });
  
  if (withdrawEvent) {
    const parsed = contract.interface.parseLog(withdrawEvent);
    console.log("Withdrawn amount:", ethers.formatEther(parsed.args.amount), "HPP");
  }
  
  console.log("Transaction hash:", receipt.hash);
  console.log("=== Withdrawal Complete ===\n");
}

async function status(contractAddress, userAddress) {
  const { contract, signer } = await getContract(contractAddress);
  const user = userAddress || signer.address;
  
  console.log(`\n=== Contract Status ===`);
  console.log("Contract Address:", contractAddress);
  console.log("User Address:", user);
  console.log("\n--- Contract Configuration ---");
  console.log("Staking Token:", await contract.stakingToken());
  console.log("Custody Wallet:", await contract.custodyWallet());
  console.log("Cooldown Duration:", (await contract.cooldownDuration()).toString(), "seconds");
  console.log("Max Cooldown Entries:", (await contract.maxGlobalCooldownEntries()).toString());
  console.log("Owner:", await contract.owner());
  console.log("Paused:", await contract.paused());
  
  console.log("\n--- Global Stats ---");
  const totalStaked = await contract.totalStaked();
  console.log("Total Staked:", ethers.formatEther(totalStaked), "HPP");
  
  console.log("\n--- User Stats ---");
  const stakedBalance = await contract.stakedBalance(user);
  const cooldownCount = await contract.cooldownCount(user);
  const withdrawable = await contract.withdrawableNow(user);
  const pending = await contract.pendingUnwithdrawn(user);
  
  console.log("Staked Balance:", ethers.formatEther(stakedBalance), "HPP");
  console.log("Cooldown Entries:", cooldownCount.toString());
  console.log("Withdrawable Now:", ethers.formatEther(withdrawable), "HPP");
  console.log("Pending Unwithdrawn:", ethers.formatEther(pending), "HPP");
  
  // Array info
  const arrayInfo = await contract.getCooldownArrayInfo(user);
  console.log("\n--- Cooldown Array Info ---");
  console.log("Total Length:", arrayInfo.totalLength.toString());
  console.log("First Valid Index:", arrayInfo.firstValidIndex.toString());
  console.log("Valid Count:", arrayInfo.validCount.toString());
  
  console.log("==========================\n");
}

async function cooldowns(contractAddress, userAddress) {
  const { contract } = await getContract(contractAddress);
  const user = userAddress || (await ethers.getSigners())[0].address;
  
  console.log(`\n=== Cooldown Details ===`);
  console.log("User:", user);
  
  const count = await contract.cooldownCount(user);
  console.log("Total cooldown entries:", count.toString());
  
  if (count === 0n) {
    console.log("No cooldown entries found");
    return;
  }
  
  console.log("\n--- Cooldown List ---");
  for (let i = 0; i < count; i++) {
    const [amount, unlockTime] = await contract.getCooldown(user, i);
    const unlockDate = new Date(Number(unlockTime) * 1000);
    const now = Date.now();
    const isUnlocked = Number(unlockTime) * 1000 <= now;
    
    console.log(`\nEntry ${i}:`);
    console.log("  Amount:", ethers.formatEther(amount), "HPP");
    console.log("  Unlock Time:", unlockDate.toISOString());
    console.log("  Status:", isUnlocked ? "UNLOCKED ✓" : "LOCKED ✗");
    if (!isUnlocked) {
      const remaining = Math.ceil((Number(unlockTime) * 1000 - now) / 1000);
      const days = Math.floor(remaining / 86400);
      const hours = Math.floor((remaining % 86400) / 3600);
      const minutes = Math.floor((remaining % 3600) / 60);
      console.log("  Remaining:", `${days}d ${hours}h ${minutes}m`);
    }
  }
  console.log("=====================\n");
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const contractAddress = args[1];
  
  if (!command || !contractAddress) {
    console.log("Usage:");
    console.log("  stake <contractAddress> <amount>");
    console.log("  unstake <contractAddress> <amount>");
    console.log("  withdraw <contractAddress>");
    console.log("  status <contractAddress> [userAddress]");
    console.log("  cooldowns <contractAddress> [userAddress]");
    process.exit(1);
  }
  
  if (!ethers.isAddress(contractAddress)) {
    console.error("Invalid contract address");
    process.exit(1);
  }
  
  try {
    switch (command) {
      case "stake":
        if (!args[2]) {
          console.error("Amount required");
          process.exit(1);
        }
        await stake(contractAddress, ethers.parseEther(args[2]));
        break;
      case "unstake":
        if (!args[2]) {
          console.error("Amount required");
          process.exit(1);
        }
        await unstake(contractAddress, ethers.parseEther(args[2]));
        break;
      case "withdraw":
        await withdraw(contractAddress);
        break;
      case "status":
        await status(contractAddress, args[2]);
        break;
      case "cooldowns":
        await cooldowns(contractAddress, args[2]);
        break;
      default:
        console.error("Unknown command:", command);
        process.exit(1);
    }
  } catch (error) {
    console.error("Error:", error.message);
    if (error.reason) {
      console.error("Reason:", error.reason);
    }
    process.exit(1);
  }
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = {
  stake,
  unstake,
  withdraw,
  status,
  cooldowns
};

