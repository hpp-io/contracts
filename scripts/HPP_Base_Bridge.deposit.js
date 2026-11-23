const { ethers } = require("ethers");
const cfg = require("./HPP_Base_Bridge.config");

/**
 * Bridges HPP from Ethereum to Base through the L1StandardBridge.
 * Run on the Ethereum side, after the L2 token has been created:
 *
 *   AMOUNT=10 npx hardhat run scripts/HPP_Base_Bridge.deposit.js --network sepolia
 *   ALLOW_MAINNET=true AMOUNT=10 npx hardhat run scripts/HPP_Base_Bridge.deposit.js --network mainnet
 *
 * AMOUNT     required, in HPP
 * RECIPIENT  optional, address that receives HPP on Base (default: the sender)
 */
async function deposit({ signer, pair, l2Provider, amount, recipient, minGasLimit = cfg.DEFAULT_MIN_GAS_LIMIT }) {
  // Must pass before any token leaves the wallet. See verifyL2Token.
  await cfg.verifyL2Token(l2Provider, pair);

  const token = new ethers.Contract(pair.l1Token, cfg.ERC20_ABI, signer);
  const bridge = new ethers.Contract(pair.l1Bridge, cfg.BRIDGE_ABI, signer);

  const otherBridge = await bridge.otherBridge();
  if (!cfg.same(otherBridge, cfg.L2_STANDARD_BRIDGE)) {
    throw new Error(`L1 bridge ${pair.l1Bridge} is paired with ${otherBridge}, expected ${cfg.L2_STANDARD_BRIDGE}.`);
  }
  if (await token.paused()) {
    throw new Error("L1 HPP is paused, so the bridge cannot pull tokens.");
  }
  const balance = await token.balanceOf(signer.address);
  if (balance < amount) {
    throw new Error(`Sender holds ${ethers.formatEther(balance)} HPP, less than ${ethers.formatEther(amount)}.`);
  }

  const allowance = await token.allowance(signer.address, pair.l1Bridge);
  if (allowance < amount) {
    console.log("Approving the L1 bridge for", ethers.formatEther(amount), "HPP...");
    const approveTx = await token.approve(pair.l1Bridge, amount);
    await approveTx.wait();
    console.log("Approval confirmed:", approveTx.hash);
  }

  console.log(`Depositing ${ethers.formatEther(amount)} HPP to ${recipient} on Base...`);
  const tx = await bridge.bridgeERC20To(pair.l1Token, pair.l2Token, recipient, amount, minGasLimit, "0x");
  console.log("Transaction:", tx.hash);
  const receipt = await tx.wait();
  console.log("Deposit confirmed on L1 in block", receipt.blockNumber);
  return receipt;
}

/// Waits for the deposit to show up on Base. Informational only; the deposit is already final on L1.
async function waitForL2Balance(l2Token, recipient, before, amount, timeoutMs = 10 * 60 * 1000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const now = await l2Token.balanceOf(recipient);
    if (now >= before + amount) return now;
    await new Promise((resolve) => setTimeout(resolve, 15000));
  }
  return null;
}

async function main() {
  const hre = require("hardhat");
  const { chainId } = await hre.ethers.provider.getNetwork();
  const pair = cfg.pairFor(chainId, "l1");
  const signer = await cfg.requireSigner(hre.ethers);
  const amount = cfg.requireAmount();
  const recipient = cfg.recipientOrDefault(signer.address);
  const l2Provider = await cfg.otherChainProvider(pair, "l2");

  console.log(`Route: ${pair.label}`);
  console.log("Account:", signer.address);

  const l2Token = await cfg.verifyL2Token(l2Provider, pair);
  const before = await l2Token.balanceOf(recipient);
  await deposit({ signer, pair, l2Provider, amount, recipient });

  console.log("Waiting for the deposit to arrive on Base (usually a few minutes)...");
  const after = await waitForL2Balance(l2Token, recipient, before, amount);
  if (after === null) {
    console.log("Not seen on Base yet. Check the recipient balance of", pair.l2Token, "later.");
  } else {
    console.log("Arrived. Recipient balance on Base:", ethers.formatEther(after), "HPP");
  }
}

module.exports = { deposit };

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
