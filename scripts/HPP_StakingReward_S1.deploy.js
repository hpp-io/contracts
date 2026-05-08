const { ethers } = require('hardhat');
const hre = require('hardhat');
const fs = require('fs');
const path = require('path');
const parse = require('csv-parse/sync');

async function main() {
  console.log('Deploying HPP_StakingReward_S1 contract...');

  const [deployer] = await ethers.getSigners();
  console.log('Deploying with account:', deployer.address);

  const HPP_TOKEN_ADDRESS = process.env.HPP_TOKEN_ADDRESS;
  if (!HPP_TOKEN_ADDRESS) {
    throw new Error('HPP_TOKEN_ADDRESS environment variable is required');
  }

  // Reward contract owner (change to multisig wallet or DAO address for production)
  const REWARD_OWNER = process.env.STAKING_REWARD_OWNER || deployer.address;

  // Reward name/identifier (default: 'S1')
  const REWARD_NAME = process.env.REWARD_NAME || 'S1';

  console.log('Reward Owner:', REWARD_OWNER);
  console.log('Reward Name:', REWARD_NAME);

  const Factory = await ethers.getContractFactory('HPP_StakingReward_S1');
  const rewardContract = await Factory.deploy(
    HPP_TOKEN_ADDRESS,
    REWARD_OWNER,
    REWARD_NAME,
  );

  await rewardContract.waitForDeployment();
  const contractAddress = await rewardContract.getAddress();
  console.log('HPP_StakingReward_S1 deployed to:', contractAddress);
  console.log('HPP Token address:', HPP_TOKEN_ADDRESS);

  // Read beneficiaries from CSV
  const csvPath = path.join(__dirname, 'staking_reward_beneficiaries/s1_beneficiaries.csv');
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV file not found: ${csvPath}`);
  }

  const csvData = fs.readFileSync(csvPath, 'utf8');
  const records = parse.parse(csvData, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  // Deduplicate (case-insensitive) and sum amounts
  const acc = new Map();
  for (const row of records) {
    const addr = String(row.address).trim();
    if (!addr) continue;
    const key = addr.toLowerCase();
    const amtStr = String(row.amount).replace(/,/g, '').trim();
    const val = ethers.parseEther(amtStr);
    acc.set(key, (acc.get(key) ?? 0n) + val);
  }

  const beneficiaries = Array.from(acc.keys()).map((k) => ethers.getAddress(k));
  const amounts = Array.from(acc.values());
  console.log('CSV unique beneficiaries:', beneficiaries.length);

  // Add rewards in batches; skip already-active or already-claimed entries for rerun safety
  const BATCH = 20;
  for (let i = 0; i < beneficiaries.length; i += BATCH) {
    const batchAllBeneficiaries = beneficiaries.slice(i, i + BATCH);
    const batchAllAmounts = amounts.slice(i, i + BATCH);
    const batchBeneficiaries = [];
    const batchAmounts = [];
    for (let j = 0; j < batchAllBeneficiaries.length; j++) {
      const addr = batchAllBeneficiaries[j];
      const r = await rewardContract.getReward(addr);
      if (!r.isActive && !r.claimed) {
        batchBeneficiaries.push(addr);
        batchAmounts.push(batchAllAmounts[j]);
      }
    }
    if (batchBeneficiaries.length === 0) {
      console.log(`Batch ${i / BATCH + 1}: skipped (all already active or claimed)`);
      continue;
    }
    const tx = await rewardContract.addRewards(batchBeneficiaries, batchAmounts);
    await tx.wait();
    console.log(`Batch ${i / BATCH + 1}: added ${batchBeneficiaries.length} rewards`);
  }
  console.log('All rewards added');

  console.log('Total reward amount:', ethers.formatEther(await rewardContract.totalRewardAmount()), 'HPP');

  // Output verify command
  const networkName = hre.network.name;
  const rewardName = `"${REWARD_NAME}"`;

  console.log('\n=== Contract Verification Command ===');
  console.log(
    `npx hardhat verify --network ${networkName} --contract contracts/HPP_StakingReward_S1.sol:HPP_StakingReward_S1 ${contractAddress} ${HPP_TOKEN_ADDRESS} ${REWARD_OWNER} ${rewardName}`,
  );
  console.log('=====================================\n');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
