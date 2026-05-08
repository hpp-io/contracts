const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("HPP_StakingReward_S1", function () {
  let reward;
  let hpp;
  let owner, alice, bob, carol;

  const REWARD_NAME = "S1";

  beforeEach(async function () {
    [owner, alice, bob, carol] = await ethers.getSigners();

    const HPP = await ethers.getContractFactory("HousePartyProtocol");
    hpp = await HPP.deploy(owner.address, owner.address);
    await hpp.waitForDeployment();

    const Reward = await ethers.getContractFactory("HPP_StakingReward_S1");
    reward = await Reward.deploy(await hpp.getAddress(), owner.address, REWARD_NAME);
    await reward.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Sets hppToken", async function () {
      expect(await reward.hppToken()).to.equal(await hpp.getAddress());
    });

    it("Sets owner", async function () {
      expect(await reward.owner()).to.equal(owner.address);
    });

    it("Sets rewardName", async function () {
      expect(await reward.rewardName()).to.equal(REWARD_NAME);
    });

    it("Starts with totalRewardAmount = 0", async function () {
      expect(await reward.totalRewardAmount()).to.equal(0n);
    });

    it("Reverts on zero token address", async function () {
      const Reward = await ethers.getContractFactory("HPP_StakingReward_S1");
      await expect(
        Reward.deploy(ethers.ZeroAddress, owner.address, REWARD_NAME)
      ).to.be.revertedWith("Invalid token address");
    });

    it("Reverts on zero owner address (OZ Ownable check)", async function () {
      const Reward = await ethers.getContractFactory("HPP_StakingReward_S1");
      await expect(
        Reward.deploy(await hpp.getAddress(), ethers.ZeroAddress, REWARD_NAME)
      ).to.be.revertedWithCustomError(Reward, "OwnableInvalidOwner");
    });
  });

  describe("addReward", function () {
    const AMOUNT = ethers.parseEther("100");

    it("Adds a single reward and updates state + emits event", async function () {
      await expect(reward.addReward(alice.address, AMOUNT))
        .to.emit(reward, "RewardAdded")
        .withArgs(alice.address, AMOUNT);

      const r = await reward.rewards(alice.address);
      expect(r.beneficiary).to.equal(alice.address);
      expect(r.totalAmount).to.equal(AMOUNT);
      expect(r.claimed).to.equal(false);
      expect(r.isActive).to.equal(true);

      expect(await reward.totalRewardAmount()).to.equal(AMOUNT);
      expect(await reward.getBeneficiaries()).to.deep.equal([alice.address]);
    });

    it("Reverts on zero beneficiary", async function () {
      await expect(reward.addReward(ethers.ZeroAddress, AMOUNT))
        .to.be.revertedWith("Invalid beneficiary address");
    });

    it("Reverts on zero amount", async function () {
      await expect(reward.addReward(alice.address, 0))
        .to.be.revertedWith("Amount must be greater than 0");
    });

    it("Reverts on duplicate active reward", async function () {
      await reward.addReward(alice.address, AMOUNT);
      await expect(reward.addReward(alice.address, AMOUNT))
        .to.be.revertedWith("Reward already exists");
    });

    it("Reverts when called by non-owner", async function () {
      await expect(reward.connect(alice).addReward(bob.address, AMOUNT))
        .to.be.revertedWithCustomError(reward, "OwnableUnauthorizedAccount");
    });
  });

  describe("addRewards", function () {
    const A1 = ethers.parseEther("10");
    const A2 = ethers.parseEther("20");
    const A3 = ethers.parseEther("30");

    it("Adds a batch", async function () {
      await reward.addRewards(
        [alice.address, bob.address, carol.address],
        [A1, A2, A3]
      );
      expect(await reward.totalRewardAmount()).to.equal(A1 + A2 + A3);
      const list = await reward.getBeneficiaries();
      expect(list).to.have.lengthOf(3);
      expect(list).to.include(alice.address);
      expect(list).to.include(bob.address);
      expect(list).to.include(carol.address);
    });

    it("Reverts on length mismatch", async function () {
      await expect(
        reward.addRewards([alice.address], [A1, A2])
      ).to.be.revertedWith("Arrays length mismatch");
    });

    it("Reverts on empty input", async function () {
      await expect(reward.addRewards([], [])).to.be.revertedWith("Empty arrays");
    });
  });

  describe("claim", function () {
    const AMOUNT = ethers.parseEther("500");

    beforeEach(async function () {
      await reward.addReward(alice.address, AMOUNT);
      // Fund the contract
      await hpp.transfer(await reward.getAddress(), AMOUNT);
    });

    it("Transfers full amount and emits RewardClaimed", async function () {
      const before = await hpp.balanceOf(alice.address);
      await expect(reward.connect(alice).claim())
        .to.emit(reward, "RewardClaimed")
        .withArgs(alice.address, AMOUNT);
      const after = await hpp.balanceOf(alice.address);
      expect(after - before).to.equal(AMOUNT);
    });

    it("Marks reward as claimed and clears claimable", async function () {
      await reward.connect(alice).claim();
      const r = await reward.rewards(alice.address);
      expect(r.claimed).to.equal(true);
      expect(r.isActive).to.equal(true);
      expect(await reward.getClaimableAmount(alice.address)).to.equal(0n);
    });

    it("Reverts on second claim", async function () {
      await reward.connect(alice).claim();
      await expect(reward.connect(alice).claim())
        .to.be.revertedWith("Already claimed");
    });

    it("Reverts when caller has no active reward", async function () {
      await expect(reward.connect(bob).claim())
        .to.be.revertedWith("No active reward");
    });
  });

  describe("getClaimableAmount", function () {
    it("Returns totalAmount for active unclaimed reward", async function () {
      const A = ethers.parseEther("42");
      await reward.addReward(alice.address, A);
      expect(await reward.getClaimableAmount(alice.address)).to.equal(A);
    });

    it("Returns 0 for unknown address", async function () {
      expect(await reward.getClaimableAmount(bob.address)).to.equal(0n);
    });
  });

  describe("getReward", function () {
    it("Returns the full Reward struct", async function () {
      const A = ethers.parseEther("7");
      await reward.addReward(alice.address, A);
      const r = await reward.getReward(alice.address);
      expect(r.beneficiary).to.equal(alice.address);
      expect(r.totalAmount).to.equal(A);
      expect(r.claimed).to.equal(false);
      expect(r.isActive).to.equal(true);
    });
  });

  describe("revokeReward", function () {
    const AMOUNT = ethers.parseEther("100");

    it("Revokes an active unclaimed reward and emits event", async function () {
      await reward.addReward(alice.address, AMOUNT);
      await expect(reward.revokeReward(alice.address))
        .to.emit(reward, "RewardRevoked")
        .withArgs(alice.address);

      const r = await reward.rewards(alice.address);
      expect(r.isActive).to.equal(false);
      expect(r.claimed).to.equal(false);
      expect(await reward.totalRewardAmount()).to.equal(0n);
      expect(await reward.getBeneficiaries()).to.deep.equal([]);
      expect(await reward.getClaimableAmount(alice.address)).to.equal(0n);
    });

    it("Allows re-registering the same address after revoke", async function () {
      await reward.addReward(alice.address, AMOUNT);
      await reward.revokeReward(alice.address);
      await reward.addReward(alice.address, AMOUNT * 2n);
      expect(await reward.totalRewardAmount()).to.equal(AMOUNT * 2n);
      expect(await reward.getClaimableAmount(alice.address)).to.equal(AMOUNT * 2n);
    });

    it("Reverts when no active reward", async function () {
      await expect(reward.revokeReward(alice.address))
        .to.be.revertedWith("No active reward");
    });

    it("Reverts when reward already claimed", async function () {
      await reward.addReward(alice.address, AMOUNT);
      await hpp.transfer(await reward.getAddress(), AMOUNT);
      await reward.connect(alice).claim();
      await expect(reward.revokeReward(alice.address))
        .to.be.revertedWith("No active reward");
    });

    it("Blocks re-registering a claimed address", async function () {
      await reward.addReward(alice.address, AMOUNT);
      await hpp.transfer(await reward.getAddress(), AMOUNT);
      await reward.connect(alice).claim();
      await expect(reward.addReward(alice.address, AMOUNT))
        .to.be.revertedWith("Reward already claimed");
    });

    it("Reverts when called by non-owner", async function () {
      await reward.addReward(alice.address, AMOUNT);
      await expect(reward.connect(bob).revokeReward(alice.address))
        .to.be.revertedWithCustomError(reward, "OwnableUnauthorizedAccount");
    });
  });

  describe("emergencyWithdraw", function () {
    const FUND = ethers.parseEther("1000");

    beforeEach(async function () {
      await hpp.transfer(await reward.getAddress(), FUND);
    });

    it("Withdraws partial balance to owner", async function () {
      const before = await hpp.balanceOf(owner.address);
      await reward.emergencyWithdraw(ethers.parseEther("400"));
      const after = await hpp.balanceOf(owner.address);
      expect(after - before).to.equal(ethers.parseEther("400"));
      expect(await hpp.balanceOf(await reward.getAddress()))
        .to.equal(ethers.parseEther("600"));
    });

    it("Reverts on zero amount", async function () {
      await expect(reward.emergencyWithdraw(0))
        .to.be.revertedWith("Amount must be greater than 0");
    });

    it("Reverts on insufficient balance", async function () {
      await expect(reward.emergencyWithdraw(FUND + 1n))
        .to.be.revertedWith("Insufficient balance");
    });

    it("Reverts when called by non-owner", async function () {
      await expect(reward.connect(alice).emergencyWithdraw(1))
        .to.be.revertedWithCustomError(reward, "OwnableUnauthorizedAccount");
    });
  });

  describe("emergencyWithdrawAll", function () {
    it("Withdraws full balance to owner", async function () {
      const FUND = ethers.parseEther("777");
      await hpp.transfer(await reward.getAddress(), FUND);
      const before = await hpp.balanceOf(owner.address);
      await reward.emergencyWithdrawAll();
      const after = await hpp.balanceOf(owner.address);
      expect(after - before).to.equal(FUND);
      expect(await hpp.balanceOf(await reward.getAddress())).to.equal(0n);
    });

    it("Reverts when no balance", async function () {
      await expect(reward.emergencyWithdrawAll())
        .to.be.revertedWith("No tokens to withdraw");
    });

    it("Reverts when called by non-owner", async function () {
      await expect(reward.connect(alice).emergencyWithdrawAll())
        .to.be.revertedWithCustomError(reward, "OwnableUnauthorizedAccount");
    });
  });

  describe("Reentrancy", function () {
    it("Blocks reentry into claim() via malicious token", async function () {
      const Mal = await ethers.getContractFactory("MaliciousReentrantToken");
      const mal = await Mal.deploy();
      await mal.waitForDeployment();

      const Reward = await ethers.getContractFactory("HPP_StakingReward_S1");
      const malReward = await Reward.deploy(
        await mal.getAddress(),
        owner.address,
        "MAL_S1"
      );
      await malReward.waitForDeployment();

      const A = ethers.parseEther("100");
      await malReward.addReward(alice.address, A);
      await mal.transfer(await malReward.getAddress(), A);
      await mal.setTarget(await malReward.getAddress());
      await mal.arm();

      await expect(malReward.connect(alice).claim())
        .to.be.revertedWithCustomError(malReward, "ReentrancyGuardReentrantCall");
    });
  });
});
