const { ethers } = require("ethers");
const cfg = require("./HPP_Base_Bridge.config");

/**
 * Starts a withdrawal of HPP from Base back to Ethereum through the L2StandardBridge.
 * Run on the Base side:
 *
 *   AMOUNT=1 npx hardhat run scripts/HPP_Base_Bridge.withdraw.js --network base_sepolia
 *   ALLOW_MAINNET=true AMOUNT=1 npx hardhat run scripts/HPP_Base_Bridge.withdraw.js --network base
 *
 * AMOUNT     required, in HPP
 * RECIPIENT  optional, address that receives HPP on Ethereum (default: the sender)
 *
 * This only starts the withdrawal (burns HPP on Base). The tokens are released on
 * Ethereum after two more L1 transactions, prove and finalize, which this script
 * does not send. Whether a bridge UI (Superbridge, Brid.gg) can complete a withdrawal
 * started here has not been verified yet; confirm it on testnet before using mainnet.
 */
async function withdraw({ signer, pair, amount, recipient, minGasLimit = cfg.DEFAULT_MIN_GAS_LIMIT }) {
  const token = await cfg.verifyL2Token(signer.provider, pair);

  const balance = await token.balanceOf(signer.address);
  if (balance < amount) {
    throw new Error(`Sender holds ${ethers.formatEther(balance)} HPP on Base, less than ${ethers.formatEther(amount)}.`);
  }

  // The bridge burns its own mintable token directly, so no approval is needed.
  const bridge = new ethers.Contract(cfg.L2_STANDARD_BRIDGE, cfg.BRIDGE_ABI, signer);
  console.log(`Withdrawing ${ethers.formatEther(amount)} HPP to ${recipient} on Ethereum...`);
  const tx = await bridge.bridgeERC20To(pair.l2Token, pair.l1Token, recipient, amount, minGasLimit, "0x");
  console.log("Transaction:", tx.hash);
  const receipt = await tx.wait();
  console.log("Withdrawal started on Base in block", receipt.blockNumber);
  return receipt;
}

async function main() {
  const hre = require("hardhat");
  const { chainId } = await hre.ethers.provider.getNetwork();
  const pair = cfg.pairFor(chainId, "l2");
  const signer = await cfg.requireSigner(hre.ethers);
  const amount = cfg.requireAmount();
  const recipient = cfg.recipientOrDefault(signer.address);

  console.log(`Route: ${pair.label}`);
  console.log("Account:", signer.address);
  const receipt = await withdraw({ signer, pair, amount, recipient });
  console.log("Next: prove, then finalize on Ethereum, using withdrawal transaction", receipt.hash);
}

module.exports = { withdraw };

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
