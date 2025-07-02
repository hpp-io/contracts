const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");
const parse = require("csv-parse/sync");

async function main() {
  console.log("Deploying HPP_Vesting_AIP21 contract...");

  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  // HPP token contract address (replace with deployed HPP token address)
  const HPP_TOKEN_ADDRESS = "0x..."; // Enter the deployed HPP token address
  
  // Vesting contract owner (change to multisig wallet or DAO address for production)
  const VESTING_OWNER = deployer.address; // Change to multisig wallet address for production

  const HPPVestingAIP21 = await ethers.getContractFactory("HPP_Vesting_AIP21");
  const vestingContract = await HPPVestingAIP21.deploy(
    HPP_TOKEN_ADDRESS,
    VESTING_OWNER
  );

  await vestingContract.waitForDeployment();
  console.log("HPP_Vesting_AIP21 deployed to:", await vestingContract.getAddress());
  console.log("HPP Token address:", HPP_TOKEN_ADDRESS);
  console.log("Vesting owner:", VESTING_OWNER);
  
  // Start vesting (based on TGE)
  console.log("Starting vesting...");
  const startVestingTx = await vestingContract.startVesting();
  await startVestingTx.wait();
  console.log("Vesting started at:", await vestingContract.vestingStartTime());
  
  // Read vesting beneficiaries and amounts from CSV (vesting_beneficiaries/aip21_beneficiaries.csv)
  const csvPath = path.join(__dirname, "vesting_beneficiaries/aip21_beneficiaries.csv");
  let beneficiaries = [];
  let amounts = [];
  if (fs.existsSync(csvPath)) {
    const csvData = fs.readFileSync(csvPath, "utf8");
    const records = parse.parse(csvData, { columns: true, skip_empty_lines: true });
    for (const row of records) {
      beneficiaries.push(row.address);
      amounts.push(ethers.parseEther(row.amount));
    }
    console.log("Beneficiaries read from CSV:", beneficiaries);
    console.log("Amounts read from CSV:", amounts.map(a => ethers.formatEther(a)));
  } else {
    // Example data (used if CSV file does not exist)
    beneficiaries = [
      "0x1234567890123456789012345678901234567890",
      "0x2345678901234567890123456789012345678901",
      "0x3456789012345678901234567890123456789012"
    ];
    amounts = [
      ethers.parseEther("10000"),
      ethers.parseEther("5000"),
      ethers.parseEther("2500")
    ];
    console.log("Sample beneficiaries:", beneficiaries);
    console.log("Sample amounts:", amounts.map(a => ethers.formatEther(a)));
  }

  const addSchedulesTx = await vestingContract.addVestingSchedules(
    beneficiaries,
    amounts
  );
  await addSchedulesTx.wait();
  console.log("Vesting schedules added");
  
  console.log("Total vesting amount:", ethers.formatEther(await vestingContract.totalVestingAmount()), "HPP");
  console.log("Vesting duration:", await vestingContract.VESTING_DURATION(), "seconds (24 months)");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 