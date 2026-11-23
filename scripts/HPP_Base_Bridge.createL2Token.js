const { ethers } = require("ethers");
const cfg = require("./HPP_Base_Bridge.config");

/**
 * Creates the Base-side HPP token through the OptimismMintableERC20Factory predeploy.
 * Run once per network, on the Base side:
 *
 *   npx hardhat run scripts/HPP_Base_Bridge.createL2Token.js --network base_sepolia
 *   ALLOW_MAINNET=true npx hardhat run scripts/HPP_Base_Bridge.createL2Token.js --network base
 *
 * Safe to rerun: it stops if the token already exists.
 */
async function createL2Token({ signer, pair, l1Provider }) {
  await cfg.verifyL1Token(l1Provider, pair);

  const l2Provider = signer.provider;
  if ((await l2Provider.getCode(pair.l2Token)) !== "0x") {
    await cfg.verifyL2Token(l2Provider, pair);
    console.log("L2 HPP already exists at:", pair.l2Token);
    return { address: pair.l2Token, created: false };
  }

  const factory = new ethers.Contract(cfg.L2_TOKEN_FACTORY, cfg.FACTORY_ABI, signer);
  const factoryBridge = await factory.BRIDGE();
  if (!cfg.same(factoryBridge, cfg.L2_STANDARD_BRIDGE)) {
    throw new Error(`Factory mints for bridge ${factoryBridge}, expected ${cfg.L2_STANDARD_BRIDGE}.`);
  }

  // The address is deterministic. Refuse to create anything other than the address in the config.
  const args = [pair.l1Token, cfg.TOKEN_NAME, cfg.TOKEN_SYMBOL];
  const predicted = await factory.createOptimismMintableERC20.staticCall(...args);
  if (!cfg.same(predicted, pair.l2Token)) {
    throw new Error(`Factory would create ${predicted}, but the config expects ${pair.l2Token}.`);
  }

  console.log("Creating L2 HPP for L1 token:", pair.l1Token);
  const tx = await factory.createOptimismMintableERC20(...args);
  console.log("Transaction:", tx.hash);
  const receipt = await tx.wait();

  const created = receipt.logs
    .filter((log) => cfg.same(log.address, cfg.L2_TOKEN_FACTORY))
    .map((log) => factory.interface.parseLog(log))
    .find((parsed) => parsed && parsed.name === "OptimismMintableERC20Created");
  if (!created || !cfg.same(created.args.localToken, pair.l2Token)) {
    throw new Error("Creation transaction did not emit the expected OptimismMintableERC20Created event.");
  }

  const token = await cfg.verifyL2Token(l2Provider, pair);
  // Reverts on a token without EIP-2612 permit.
  await token.DOMAIN_SEPARATOR();
  console.log("L2 HPP created at:", pair.l2Token);
  console.log("Token version:", await token.version());
  return { address: pair.l2Token, created: true };
}

async function main() {
  const hre = require("hardhat");
  const { chainId } = await hre.ethers.provider.getNetwork();
  const pair = cfg.pairFor(chainId, "l2");
  const signer = await cfg.requireSigner(hre.ethers);
  const l1Provider = await cfg.otherChainProvider(pair, "l1");

  console.log(`Route: ${pair.label}`);
  console.log("Account:", signer.address);
  await createL2Token({ signer, pair, l1Provider });
}

module.exports = { createL2Token };

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
