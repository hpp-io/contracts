const { ethers } = require('hardhat');
const hre = require('hardhat');
const fs = require('fs');
const path = require('path');
const parse = require('csv-parse/sync');

async function main() {
  console.log('Deploying HPP_Vesting contract...');

  const [deployer] = await ethers.getSigners();
  console.log('Deploying with account:', deployer.address);

  // HPP token contract address
  const HPP_TOKEN_ADDRESS = process.env.HPP_TOKEN_ADDRESS;
  if (!HPP_TOKEN_ADDRESS) {
    throw new Error('HPP_TOKEN_ADDRESS environment variable is required');
  }

  // Vesting contract owner (change to multisig wallet or DAO address for production)
  const VESTING_OWNER = deployer.address; // Change to multisig wallet address for production

  // Vesting start time (Unix timestamp in seconds)
  // Default: deployment timestamp (current time)
  // Can be overridden via VESTING_START_TIME environment variable
  const VESTING_START_TIME = process.env.VESTING_START_TIME
    ? parseInt(process.env.VESTING_START_TIME, 10)
    : Math.floor(Date.now() / 1000);

  // Vesting duration (in seconds)
  // Default: 63072000 seconds (730 days = 24 months)
  const VESTING_DURATION = process.env.VESTING_DURATION ? parseInt(process.env.VESTING_DURATION, 10) : 63072000; // 730 days * 24 hours * 60 minutes * 60 seconds

  // Validate values
  if (isNaN(VESTING_START_TIME) || VESTING_START_TIME <= 0) {
    throw new Error(`Invalid VESTING_START_TIME: ${process.env.VESTING_START_TIME || 'undefined'}`);
  }
  if (isNaN(VESTING_DURATION) || VESTING_DURATION <= 0) {
    throw new Error(`Invalid VESTING_DURATION: ${process.env.VESTING_DURATION || 'undefined'}`);
  }

  console.log('Vesting Start Time:', VESTING_START_TIME, 'seconds');
  console.log('Vesting Duration:', VESTING_DURATION, 'seconds');

  // Vesting name/identifier (default: empty string, can be overridden via VESTING_NAME)
  const VESTING_NAME = process.env.VESTING_NAME || '';

  console.log('Vesting Name:', VESTING_NAME);

  const HPPVesting = await ethers.getContractFactory('HPP_Vesting');
  const vestingContract = await HPPVesting.deploy(
    HPP_TOKEN_ADDRESS,
    VESTING_OWNER,
    VESTING_START_TIME,
    VESTING_DURATION,
    VESTING_NAME,
  );

  await vestingContract.waitForDeployment();
  console.log('HPP_Vesting deployed to:', await vestingContract.getAddress());
  console.log('HPP Token address:', HPP_TOKEN_ADDRESS);
  console.log('Vesting owner:', VESTING_OWNER);
  console.log('Vesting start time:', (await vestingContract.vestingStartTime()).toString());
  console.log('Vesting duration:', (await vestingContract.vestingDuration()).toString(), 'seconds');
  console.log('Vesting name:', await vestingContract.vestingName());

  // Read vesting beneficiaries and amounts from CSV (vesting_beneficiaries/aip21_beneficiaries.csv)
  const csvPath = path.join(__dirname, 'vesting_beneficiaries/aip21_beneficiaries.csv');
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

  // Add schedules in batches to avoid block gas limit
  const BATCH = 20;
  for (let i = 0; i < beneficiaries.length; i += BATCH) {
    const batchAllBeneficiaries = beneficiaries.slice(i, i + BATCH);
    const batchAllAmounts = amounts.slice(i, i + BATCH);
    // Filter out already-active schedules to avoid revert on reruns
    const batchBeneficiaries = [];
    const batchAmounts = [];
    for (let j = 0; j < batchAllBeneficiaries.length; j++) {
      const addr = batchAllBeneficiaries[j];
      const s = await vestingContract.getVestingSchedule(addr);
      if (!s.isActive) {
        batchBeneficiaries.push(addr);
        batchAmounts.push(batchAllAmounts[j]);
      }
    }
    if (batchBeneficiaries.length === 0) {
      console.log(`Batch ${i / BATCH + 1}: skipped (all already active)`);
      continue;
    }
    const tx = await vestingContract.addVestingSchedules(batchBeneficiaries, batchAmounts);
    await tx.wait();
    console.log(`Batch ${i / BATCH + 1}: added ${batchBeneficiaries.length} schedules`);
  }
  console.log('All vesting schedules added');

  console.log('Total vesting amount:', ethers.formatEther(await vestingContract.totalVestingAmount()), 'HPP');
  const vestingDurationSeconds = await vestingContract.vestingDuration();
  console.log('Vesting duration:', vestingDurationSeconds.toString(), 'seconds');

  // Output verify command
  const contractAddress = await vestingContract.getAddress();
  const networkName = hre.network.name;

  const vestingName = `"${VESTING_NAME || ''}"`;

  console.log('\n=== Contract Verification Command ===');
  console.log(
    `npx hardhat verify --network ${networkName} --contract contracts/HPP_Vesting.sol:HPP_Vesting ${contractAddress} ${HPP_TOKEN_ADDRESS} ${VESTING_OWNER} ${VESTING_START_TIME} ${VESTING_DURATION} ${vestingName}`,
  );
  console.log('=====================================\n');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
