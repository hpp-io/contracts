const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");
const parse = require("csv-parse/sync");

async function main() {
  console.log("Deploying HPP_Vesting_AIP21 contract...");

  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  // HPP token contract address
  const HPP_TOKEN_ADDRESS = process.env.HPP_TOKEN_ADDRESS;

  // Vesting contract owner (change to multisig wallet or DAO address for production)
  const VESTING_OWNER = deployer.address; // Change to multisig wallet address for production

  const HPPVestingAIP21 = await ethers.getContractFactory("HPP_Vesting_AIP21");
  const vestingContract = await HPPVestingAIP21.deploy(
    HPP_TOKEN_ADDRESS,
    VESTING_OWNER
  );

  await vestingContract.waitForDeployment();
  console.log(
    "HPP_Vesting_AIP21 deployed to:",
    await vestingContract.getAddress()
  );
  console.log("HPP Token address:", HPP_TOKEN_ADDRESS);
  console.log("Vesting owner:", VESTING_OWNER);

  // Start vesting (based on TGE)
  console.log("Starting vesting...");
  const startVestingTx = await vestingContract.startVesting();
  await startVestingTx.wait();
  console.log("Vesting started at:", await vestingContract.vestingStartTime());

  // Read vesting beneficiaries and amounts from CSV (vesting_beneficiaries/aip21_beneficiaries.csv)
  const csvPath = path.join(
    __dirname,
    "vesting_beneficiaries/aip21_beneficiaries.csv"
  );
  let beneficiaries = [];
  let amounts = [];
  if (fs.existsSync(csvPath)) {
    const csvData = fs.readFileSync(csvPath, "utf8");
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
      const amtStr = String(row.amount).replace(/,/g, "").trim();
      const val = ethers.parseEther(amtStr);
      acc.set(key, (acc.get(key) ?? 0n) + val);
    }
    beneficiaries = Array.from(acc.keys()).map((k) => ethers.getAddress(k));
    amounts = Array.from(acc.values());
    console.log("CSV unique beneficiaries:", beneficiaries.length);
  } else {
    // Example data (used if CSV file does not exist)
    beneficiaries = [
      "0x1234567890123456789012345678901234567890",
      "0x2345678901234567890123456789012345678901",
      "0x3456789012345678901234567890123456789012",
    ];
    amounts = [
      ethers.parseEther("10000"),
      ethers.parseEther("5000"),
      ethers.parseEther("2500"),
    ];
    console.log("Sample beneficiaries:", beneficiaries);
    console.log(
      "Sample amounts:",
      amounts.map((a) => ethers.formatEther(a))
    );
  }

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
    const tx = await vestingContract.addVestingSchedules(
      batchBeneficiaries,
      batchAmounts
    );
    await tx.wait();
    console.log(
      `Batch ${i / BATCH + 1}: added ${batchBeneficiaries.length} schedules`
    );
  }
  console.log("All vesting schedules added");

  console.log(
    "Total vesting amount:",
    ethers.formatEther(await vestingContract.totalVestingAmount()),
    "HPP"
  );
  console.log(
    "Vesting duration:",
    await vestingContract.VESTING_DURATION(),
    "seconds (24 months)"
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
