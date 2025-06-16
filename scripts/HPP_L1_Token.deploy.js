const { ethers } = require("hardhat");

async function main() {
  console.log("Deploying HousePartyProtocol Token contract...");

const HPP_TOKEN_Recipient = "0x1975552499c759bEAE09Fd93a57F45B7D4C84B54"; // HPP Testnet Token Deployer
// const HPP_TOKEN_Recipient = "0x55f7503D254A22Fb35c9F4E35f95ECc3009E3579"; // HPP Mainnet Token Deployer

  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  const HPPToken = await ethers.getContractFactory("HousePartyProtocol");
  const token = await HPPToken.deploy(
    HPP_TOKEN_Recipient,
    deployer.address // initialOwner
  );

  await token.waitForDeployment();
  console.log("HousePartyProtocol deployed to:", await token.getAddress());
  console.log("HousePartyProtocol token recipient to:", HPP_TOKEN_Recipient);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
