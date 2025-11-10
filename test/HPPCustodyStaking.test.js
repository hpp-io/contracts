const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("HPPCustodyStaking", function () {
  let stakingContract;
  let mockToken;
  let owner;
  let custodyWallet;
  let user1;
  let user2;
  let otherAccounts;

  // const COOLDOWN_DURATION = 7 * 24 * 60 * 60; // 7 days
  const COOLDOWN_DURATION = 2 * 60; // 2 minutes (test)
  const INITIAL_SUPPLY = ethers.parseEther("1000000"); // 1M tokens

  beforeEach(async function () {
    [owner, custodyWallet, user1, user2, ...otherAccounts] = await ethers.getSigners();

    // Deploy HPP Token (HousePartyProtocol)
    const HousePartyProtocol = await ethers.getContractFactory("HousePartyProtocol");
    mockToken = await HousePartyProtocol.deploy(owner.address, owner.address);
    await mockToken.waitForDeployment();

    // Distribute tokens to users (owner received 1.7B tokens initially)
    await mockToken.transfer(user1.address, ethers.parseEther("100000"));
    await mockToken.transfer(user2.address, ethers.parseEther("100000"));

    // Deploy staking contract
    const HPPCustodyStaking = await ethers.getContractFactory("HPPCustodyStaking");
    stakingContract = await HPPCustodyStaking.deploy(
      await mockToken.getAddress(),
      custodyWallet.address,
      COOLDOWN_DURATION
    );
    await stakingContract.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the correct staking token", async function () {
      expect(await stakingContract.stakingToken()).to.equal(await mockToken.getAddress());
    });

    it("Should set the correct custody wallet", async function () {
      expect(await stakingContract.custodyWallet()).to.equal(custodyWallet.address);
    });

    it("Should set the correct cooldown duration", async function () {
      expect(await stakingContract.cooldownDuration()).to.equal(COOLDOWN_DURATION);
    });

    it("Should set the correct owner", async function () {
      expect(await stakingContract.owner()).to.equal(owner.address);
    });

    it("Should set default max cooldown entries", async function () {
      expect(await stakingContract.maxGlobalCooldownEntries()).to.equal(50);
    });

    it("Should revert if token address is zero", async function () {
      const HPPCustodyStaking = await ethers.getContractFactory("HPPCustodyStaking");
      await expect(
        HPPCustodyStaking.deploy(ethers.ZeroAddress, custodyWallet.address, COOLDOWN_DURATION)
      ).to.be.revertedWithCustomError({ interface: HPPCustodyStaking.interface }, "ZeroAddress");
    });

    it("Should revert if custody address is zero", async function () {
      const HPPCustodyStaking = await ethers.getContractFactory("HPPCustodyStaking");
      await expect(
        HPPCustodyStaking.deploy(await mockToken.getAddress(), ethers.ZeroAddress, COOLDOWN_DURATION)
      ).to.be.revertedWithCustomError({ interface: HPPCustodyStaking.interface }, "ZeroAddress");
    });
  });

  describe("Staking", function () {
    const stakeAmount = ethers.parseEther("1000");

    beforeEach(async function () {
      await mockToken.connect(user1).approve(await stakingContract.getAddress(), stakeAmount);
    });

    it("Should allow users to stake tokens", async function () {
      await expect(stakingContract.connect(user1).stake(stakeAmount))
        .to.emit(stakingContract, "Staked")
        .withArgs(user1.address, stakeAmount, custodyWallet.address)
        .to.emit(stakingContract, "CustodyReceived")
        .withArgs(stakeAmount, custodyWallet.address);

      expect(await stakingContract.stakedBalance(user1.address)).to.equal(stakeAmount);
      expect(await stakingContract.totalStaked()).to.equal(stakeAmount);
      expect(await mockToken.balanceOf(custodyWallet.address)).to.equal(stakeAmount);
    });

    it("Should transfer tokens from user to contract then to custody", async function () {
      const userBalanceBefore = await mockToken.balanceOf(user1.address);
      const custodyBalanceBefore = await mockToken.balanceOf(custodyWallet.address);

      await stakingContract.connect(user1).stake(stakeAmount);

      const userBalanceAfter = await mockToken.balanceOf(user1.address);
      const custodyBalanceAfter = await mockToken.balanceOf(custodyWallet.address);
      const contractBalance = await mockToken.balanceOf(await stakingContract.getAddress());

      expect(userBalanceBefore - userBalanceAfter).to.equal(stakeAmount);
      expect(custodyBalanceAfter - custodyBalanceBefore).to.equal(stakeAmount);
      expect(contractBalance).to.equal(0); // Contract should have 0 balance
    });

    it("Should update staked balance correctly", async function () {
      await stakingContract.connect(user1).stake(stakeAmount);
      expect(await stakingContract.stakedBalance(user1.address)).to.equal(stakeAmount);

      // Stake more
      const additionalAmount = ethers.parseEther("500");
      await mockToken.connect(user1).approve(await stakingContract.getAddress(), additionalAmount);
      await stakingContract.connect(user1).stake(additionalAmount);

      expect(await stakingContract.stakedBalance(user1.address)).to.equal(stakeAmount + additionalAmount);
      expect(await stakingContract.totalStaked()).to.equal(stakeAmount + additionalAmount);
    });

    it("Should revert if amount is zero", async function () {
      await expect(stakingContract.connect(user1).stake(0))
        .to.be.revertedWithCustomError(stakingContract, "ZeroAmount");
    });

    it("Should revert if not approved", async function () {
      await mockToken.connect(user1).approve(await stakingContract.getAddress(), 0);
      await expect(stakingContract.connect(user1).stake(stakeAmount))
        .to.be.reverted;
    });

    it("Should revert when paused", async function () {
      await stakingContract.connect(owner).pause();
      await expect(stakingContract.connect(user1).stake(stakeAmount))
        .to.be.revertedWithCustomError(stakingContract, "EnforcedPause");
    });

    it("Should allow multiple users to stake", async function () {
      const amount1 = ethers.parseEther("1000");
      const amount2 = ethers.parseEther("2000");

      await mockToken.connect(user1).approve(await stakingContract.getAddress(), amount1);
      await mockToken.connect(user2).approve(await stakingContract.getAddress(), amount2);

      await stakingContract.connect(user1).stake(amount1);
      await stakingContract.connect(user2).stake(amount2);

      expect(await stakingContract.stakedBalance(user1.address)).to.equal(amount1);
      expect(await stakingContract.stakedBalance(user2.address)).to.equal(amount2);
      expect(await stakingContract.totalStaked()).to.equal(amount1 + amount2);
    });
  });

  describe("Unstaking", function () {
    const stakeAmount = ethers.parseEther("1000");
    const unstakeAmount = ethers.parseEther("500");

    beforeEach(async function () {
      await mockToken.connect(user1).approve(await stakingContract.getAddress(), stakeAmount);
      await stakingContract.connect(user1).stake(stakeAmount);
    });

    it("Should allow users to request unstaking", async function () {
      const tx = await stakingContract.connect(user1).unstake(unstakeAmount);
      const receipt = await tx.wait();

      expect(await stakingContract.stakedBalance(user1.address)).to.equal(stakeAmount - unstakeAmount);
      expect(await stakingContract.totalStaked()).to.equal(stakeAmount - unstakeAmount);
      expect(await stakingContract.cooldownCount(user1.address)).to.equal(1);

      // Check event
      const unstakeEvent = receipt.logs.find(log => {
        try {
          const parsed = stakingContract.interface.parseLog(log);
          return parsed && parsed.name === "UnstakeRequested";
        } catch {
          return false;
        }
      });
      expect(unstakeEvent).to.not.be.undefined;
    });

    it("Should create cooldown entry with correct unlock time", async function () {
      const blockTimestamp = await time.latest();
      await stakingContract.connect(user1).unstake(unstakeAmount);

      const [amount, unlockTime] = await stakingContract.getCooldown(user1.address, 0);
      expect(amount).to.equal(unstakeAmount);
      expect(unlockTime).to.be.gte(blockTimestamp + COOLDOWN_DURATION);
    });

    it("Should allow multiple unstake requests", async function () {
      await stakingContract.connect(user1).unstake(ethers.parseEther("100"));
      await stakingContract.connect(user1).unstake(ethers.parseEther("200"));

      expect(await stakingContract.cooldownCount(user1.address)).to.equal(2);
      expect(await stakingContract.stakedBalance(user1.address)).to.equal(ethers.parseEther("700"));
    });

    it("Should revert if amount is zero", async function () {
      await expect(stakingContract.connect(user1).unstake(0))
        .to.be.revertedWithCustomError(stakingContract, "ZeroAmount");
    });

    it("Should revert if insufficient stake", async function () {
      await expect(stakingContract.connect(user1).unstake(ethers.parseEther("2000")))
        .to.be.revertedWithCustomError(stakingContract, "InsufficientStake");
    });

    it("Should revert when paused", async function () {
      await stakingContract.connect(owner).pause();
      await expect(stakingContract.connect(user1).unstake(unstakeAmount))
        .to.be.revertedWithCustomError(stakingContract, "EnforcedPause");
    });

    it("Should revert if max cooldown entries reached", async function () {
      // Set max entries to 2
      await stakingContract.connect(owner).setMaxGlobalCooldownEntries(2);

      await stakingContract.connect(user1).unstake(ethers.parseEther("100"));
      await stakingContract.connect(user1).unstake(ethers.parseEther("100"));

      // Should fail on third request
      await expect(stakingContract.connect(user1).unstake(ethers.parseEther("100")))
        .to.be.revertedWithCustomError(stakingContract, "MaxCooldownEntriesReached");
    });
  });

  describe("Withdrawal", function () {
    const stakeAmount = ethers.parseEther("1000");
    const unstakeAmount = ethers.parseEther("500");

    beforeEach(async function () {
      await mockToken.connect(user1).approve(await stakingContract.getAddress(), stakeAmount);
      await stakingContract.connect(user1).stake(stakeAmount);
      await stakingContract.connect(user1).unstake(unstakeAmount);
    });

    it("Should allow withdrawal after cooldown period", async function () {
      // Fast forward time
      await time.increase(COOLDOWN_DURATION + 1);

      // Custody must approve
      await mockToken.connect(custodyWallet).approve(await stakingContract.getAddress(), unstakeAmount);

      const userBalanceBefore = await mockToken.balanceOf(user1.address);
      await expect(stakingContract.connect(user1).withdraw())
        .to.emit(stakingContract, "Withdrawn")
        .withArgs(user1.address, unstakeAmount, custodyWallet.address);

      const userBalanceAfter = await mockToken.balanceOf(user1.address);
      expect(userBalanceAfter - userBalanceBefore).to.equal(unstakeAmount);
      expect(await stakingContract.cooldownCount(user1.address)).to.equal(0);
    });

    it("Should revert if cooldown not finished", async function () {
      await mockToken.connect(custodyWallet).approve(await stakingContract.getAddress(), unstakeAmount);
      await expect(stakingContract.connect(user1).withdraw())
        .to.be.revertedWithCustomError(stakingContract, "CooldownNotFinished");
    });

    it("Should revert if custody allowance insufficient", async function () {
      await time.increase(COOLDOWN_DURATION + 1);
      await mockToken.connect(custodyWallet).approve(await stakingContract.getAddress(), unstakeAmount - 1n);

      await expect(stakingContract.connect(user1).withdraw())
        .to.be.revertedWithCustomError(stakingContract, "InsufficientCustodyAllowance");
    });

    it("Should withdraw multiple consecutive unlocked entries", async function () {
      // Create multiple unstake requests
      await stakingContract.connect(user1).unstake(ethers.parseEther("200"));
      await stakingContract.connect(user1).unstake(ethers.parseEther("100"));

      // Fast forward time
      await time.increase(COOLDOWN_DURATION + 1);

      const totalWithdrawable = ethers.parseEther("800"); // 500 + 200 + 100
      await mockToken.connect(custodyWallet).approve(await stakingContract.getAddress(), totalWithdrawable);

      await stakingContract.connect(user1).withdraw();
      expect(await stakingContract.cooldownCount(user1.address)).to.equal(0);
    });

    it("Should only withdraw consecutive unlocked entries", async function () {
      // First, withdraw the initial unstake from beforeEach
      await time.increase(COOLDOWN_DURATION + 1);
      await mockToken.connect(custodyWallet).approve(await stakingContract.getAddress(), unstakeAmount);
      await stakingContract.connect(user1).withdraw();

      // Create first unstake request
      await stakingContract.connect(user1).unstake(ethers.parseEther("200"));
      
      // Fast forward time to expire first entry
      await time.increase(COOLDOWN_DURATION + 1);
      
      // Create second unstake request (this one should still be locked)
      await stakingContract.connect(user1).unstake(ethers.parseEther("100"));

      await mockToken.connect(custodyWallet).approve(await stakingContract.getAddress(), ethers.parseEther("300"));

      // Should only withdraw first entry (200), second entry (100) is still locked
      await stakingContract.connect(user1).withdraw();
      expect(await stakingContract.cooldownCount(user1.address)).to.equal(1); // One entry remaining
    });

    it("Should return 0 if no cooldown entries", async function () {
      await time.increase(COOLDOWN_DURATION + 1);
      await mockToken.connect(custodyWallet).approve(await stakingContract.getAddress(), unstakeAmount);
      await stakingContract.connect(user1).withdraw();

      // Try to withdraw again
      const tx = await stakingContract.connect(user1).withdraw();
      const receipt = await tx.wait();
      expect(receipt.status).to.equal(1); // Should succeed but do nothing
    });
  });

  describe("View Functions", function () {
    const stakeAmount = ethers.parseEther("1000");

    beforeEach(async function () {
      await mockToken.connect(user1).approve(await stakingContract.getAddress(), stakeAmount);
      await stakingContract.connect(user1).stake(stakeAmount);
    });

    it("Should return correct cooldown count", async function () {
      expect(await stakingContract.cooldownCount(user1.address)).to.equal(0);

      await stakingContract.connect(user1).unstake(ethers.parseEther("100"));
      expect(await stakingContract.cooldownCount(user1.address)).to.equal(1);

      await stakingContract.connect(user1).unstake(ethers.parseEther("100"));
      expect(await stakingContract.cooldownCount(user1.address)).to.equal(2);
    });

    it("Should return correct cooldown info", async function () {
      const unstakeAmount = ethers.parseEther("300");
      await stakingContract.connect(user1).unstake(unstakeAmount);

      const [amount, unlockTime] = await stakingContract.getCooldown(user1.address, 0);
      expect(amount).to.equal(unstakeAmount);
      expect(unlockTime).to.be.gt(await time.latest());
    });

    it("Should revert on invalid cooldown index", async function () {
      await expect(stakingContract.getCooldown(user1.address, 0))
        .to.be.revertedWithCustomError(stakingContract, "InvalidCooldownIndex");
    });

    it("Should return correct withdrawable amount", async function () {
      await stakingContract.connect(user1).unstake(ethers.parseEther("500"));
      await time.increase(COOLDOWN_DURATION + 1);

      expect(await stakingContract.withdrawableNow(user1.address)).to.equal(ethers.parseEther("500"));
    });

    it("Should return correct pending unwithdrawn amount", async function () {
      await stakingContract.connect(user1).unstake(ethers.parseEther("300"));
      await stakingContract.connect(user1).unstake(ethers.parseEther("200"));

      expect(await stakingContract.pendingUnwithdrawn(user1.address)).to.equal(ethers.parseEther("500"));
    });

    it("Should return correct cooldown array info", async function () {
      await stakingContract.connect(user1).unstake(ethers.parseEther("100"));
      await stakingContract.connect(user1).unstake(ethers.parseEther("100"));

      const [totalLength, firstValidIndex, validCount] = await stakingContract.getCooldownArrayInfo(user1.address);
      expect(totalLength).to.equal(2);
      expect(firstValidIndex).to.equal(0);
      expect(validCount).to.equal(2);
    });
  });

  describe("Admin Functions", function () {
    it("Should allow owner to pause/unpause", async function () {
      await stakingContract.connect(owner).pause();
      expect(await stakingContract.paused()).to.be.true;

      await stakingContract.connect(owner).unpause();
      expect(await stakingContract.paused()).to.be.false;
    });

    it("Should not allow non-owner to pause", async function () {
      await expect(stakingContract.connect(user1).pause())
        .to.be.revertedWithCustomError(stakingContract, "OwnableUnauthorizedAccount");
    });

    it("Should allow owner to set cooldown duration", async function () {
      const newDuration = 14 * 24 * 60 * 60; // 14 days
      await expect(stakingContract.connect(owner).setCooldownDuration(newDuration))
        .to.emit(stakingContract, "CooldownDurationUpdated")
        .withArgs(COOLDOWN_DURATION, newDuration);

      expect(await stakingContract.cooldownDuration()).to.equal(newDuration);
    });

    it("Should allow owner to set max cooldown entries", async function () {
      const newMax = 100;
      await expect(stakingContract.connect(owner).setMaxGlobalCooldownEntries(newMax))
        .to.emit(stakingContract, "MaxGlobalCooldownEntriesUpdated")
        .withArgs(50, newMax);

      expect(await stakingContract.maxGlobalCooldownEntries()).to.equal(newMax);
    });

    it("Should revert if setting max entries to zero", async function () {
      await expect(stakingContract.connect(owner).setMaxGlobalCooldownEntries(0))
        .to.be.revertedWithCustomError(stakingContract, "ZeroAmount");
    });

    it("Should allow owner to rescue tokens", async function () {
      // Send some tokens to contract
      await mockToken.transfer(await stakingContract.getAddress(), ethers.parseEther("100"));

      const rescueAmount = ethers.parseEther("50");
      await expect(stakingContract.connect(owner).rescueTokens(await mockToken.getAddress(), user1.address, rescueAmount))
        .to.emit(stakingContract, "Rescue")
        .withArgs(await mockToken.getAddress(), user1.address, rescueAmount);

      expect(await mockToken.balanceOf(user1.address)).to.be.gte(rescueAmount);
    });

    it("Should revert ownership renouncement", async function () {
      await expect(stakingContract.connect(owner).renounceOwnership())
        .to.be.revertedWithCustomError(stakingContract, "OwnershipRenouncementDisabled");
    });
  });

  describe("Custody Wallet Change", function () {
    it("Should allow owner to propose custody wallet change", async function () {
      const newCustody = user1.address;
      await expect(stakingContract.connect(owner).proposeCustodyWallet(newCustody))
        .to.emit(stakingContract, "CustodyChangeProposed")
        .withArgs(custodyWallet.address, newCustody);

      expect(await stakingContract.pendingCustodyWallet()).to.equal(newCustody);
    });

    it("Should allow new custody to accept", async function () {
      const newCustody = user1.address;
      await stakingContract.connect(owner).proposeCustodyWallet(newCustody);

      await expect(stakingContract.connect(user1).acceptCustodyWallet())
        .to.emit(stakingContract, "CustodyChanged")
        .withArgs(custodyWallet.address, newCustody);

      expect(await stakingContract.custodyWallet()).to.equal(newCustody);
      expect(await stakingContract.pendingCustodyWallet()).to.equal(ethers.ZeroAddress);
    });

    it("Should revert if non-pending custody tries to accept", async function () {
      await stakingContract.connect(owner).proposeCustodyWallet(user1.address);
      await expect(stakingContract.connect(user2).acceptCustodyWallet())
        .to.be.revertedWith("ONLY_PENDING_CUSTODY_CAN_ACCEPT");
    });

    it("Should revert if no pending custody change", async function () {
      await expect(stakingContract.connect(user1).acceptCustodyWallet())
        .to.be.revertedWithCustomError(stakingContract, "PendingCustodyChangeNone");
    });

    it("Should use new custody wallet for staking after change", async function () {
      const newCustody = user1.address;
      const balanceBefore = await mockToken.balanceOf(newCustody);
      
      await stakingContract.connect(owner).proposeCustodyWallet(newCustody);
      await stakingContract.connect(user1).acceptCustodyWallet();

      const stakeAmount = ethers.parseEther("1000");
      await mockToken.connect(user2).approve(await stakingContract.getAddress(), stakeAmount);
      await stakingContract.connect(user2).stake(stakeAmount);

      const balanceAfter = await mockToken.balanceOf(newCustody);
      expect(balanceAfter - balanceBefore).to.equal(stakeAmount);
    });
  });

  describe("Array Compaction", function () {
    beforeEach(async function () {
      await mockToken.connect(user1).approve(await stakingContract.getAddress(), ethers.parseEther("10000"));
      await stakingContract.connect(user1).stake(ethers.parseEther("10000"));
    });

    it("Should allow manual compaction", async function () {
      // Create first 10 unstake requests
      for (let i = 0; i < 10; i++) {
        await stakingContract.connect(user1).unstake(ethers.parseEther("100"));
      }

      // Fast forward time to expire first 10 entries
      await time.increase(COOLDOWN_DURATION + 1);

      // Create 2 more unstake requests (these should still be locked)
      await stakingContract.connect(user1).unstake(ethers.parseEther("100"));
      await stakingContract.connect(user1).unstake(ethers.parseEther("100"));

      // Withdraw first 10 entries (lastProcessedIdx = 10, which doesn't meet > 10 condition for auto-compaction)
      await mockToken.connect(custodyWallet).approve(await stakingContract.getAddress(), ethers.parseEther("10000"));
      await stakingContract.connect(user1).withdraw();
      
      // Check array info after withdraw (auto-compaction should NOT have happened)
      const [totalLengthAfter, firstValidIndexAfter, validCountAfter] = await stakingContract.getCooldownArrayInfo(user1.address);
      expect(firstValidIndexAfter).to.equal(10); // Should be 10, not 0 (auto-compaction didn't happen)
      expect(validCountAfter).to.equal(2); // 2 remaining entries
      
      // Now manually compact
      await expect(stakingContract.connect(user1).compactCooldownArray())
        .to.emit(stakingContract, "CooldownArrayCompacted");

      const [totalLength, firstValidIndex, validCount] = await stakingContract.getCooldownArrayInfo(user1.address);
      expect(firstValidIndex).to.equal(0);
      expect(validCount).to.equal(2);
      expect(totalLength).to.equal(2);
    });
  });

  describe("Edge Cases", function () {
    it("Should handle zero balance correctly", async function () {
      expect(await stakingContract.stakedBalance(user1.address)).to.equal(0);
      expect(await stakingContract.totalStaked()).to.equal(0);
    });

    it("Should handle multiple users independently", async function () {
      const amount1 = ethers.parseEther("1000");
      const amount2 = ethers.parseEther("2000");

      await mockToken.connect(user1).approve(await stakingContract.getAddress(), amount1);
      await mockToken.connect(user2).approve(await stakingContract.getAddress(), amount2);

      await stakingContract.connect(user1).stake(amount1);
      await stakingContract.connect(user2).stake(amount2);

      await stakingContract.connect(user1).unstake(ethers.parseEther("500"));
      await stakingContract.connect(user2).unstake(ethers.parseEther("1000"));

      expect(await stakingContract.stakedBalance(user1.address)).to.equal(ethers.parseEther("500"));
      expect(await stakingContract.stakedBalance(user2.address)).to.equal(ethers.parseEther("1000"));
      expect(await stakingContract.totalStaked()).to.equal(ethers.parseEther("1500"));
    });
  });
});

