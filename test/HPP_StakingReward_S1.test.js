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
});
