const { assert, expect } = require("chai");
const { ethers } = require("hardhat");
const fs = require('fs');
const { format } = require("path");
const { deployOhmContracts } = require("./ohm");
const SCALE = ethers.utils.parseUnits('1', 40);

describe("MarinateV2", async function () {
  let owner, accounts;
  let marinate;
  let marinateReceiver;
  let UMAMI, sUMAMI, wsUMAMI;
  let rewardToken;
  let coreContracts;
  const provider = await ethers.getDefaultProvider("http://localhost:8545");

  async function printTokenBalance(token, address) {
    let balance = await token.balanceOf(address);
    console.log(`token balance for ${address} is ${ethers.utils.formatEther(balance)}`);
  }

  function listenForContractEvents(contract, eventName) {
    return new Promise((resolve, reject) => {
        contract.once(eventName, (...args) => {
          const event = args[args.length - 1];
          event.removeListener();
          resolve(event);
        });
        setTimeout(() => {
          reject(new Error('timeout'));
        }, 60000)
    });
  }

  async function fastForward(seconds) {
    await network.provider.send("evm_increaseTime", [seconds]);
    await network.provider.send("evm_mine");
  }

  before(async () => {
    [owner, ...accounts] = await ethers.getSigners();

    wsUMAMI = await (await ethers.getContractFactory("wUMAMI")).deploy(sUMAMI.address);
    let amount = ethers.utils.parseEther("100000");
    
    // Mint tokens
    await coreContracts.mim.approve(coreContracts.treasury.address, amount);
    await coreContracts.treasury.deposit(amount, coreContracts.mim.address, 0);

    // Add excess reserves
    await coreContracts.mim.approve(coreContracts.treasury.address, amount);
    await coreContracts.treasury.deposit(amount, coreContracts.mim.address, amount.div(Math.pow(10, 9)));

    // Stake to receive some sUMAMI
    let newAmount = amount.div(Math.pow(10, 9)); // convert to 9 decimals
    await UMAMI.approve(coreContracts.stakingHelper.address, newAmount.div(2));
    await coreContracts.stakingHelper.stake(newAmount.div(2), owner.address);
  });

  beforeEach(async () => {
    const Marinate = await ethers.getContractFactory("MarinateV2");
    marinate = await Marinate.deploy(UMAMI.address, sUMAMI.address, wsUMAMI.address);
    const MarinateReceiver = await ethers.getContractFactory("MarinateReceiver");
    marinateReceiver = await MarinateReceiver.deploy(marinate.address, UMAMI.address, sUMAMI.address, wsUMAMI.address);
    await marinateReceiver.setStaking(coreContracts.stakingHelper.address);
    let approveAmount = ethers.utils.parseEther("100000");

    const TestToken = await ethers.getContractFactory("TestToken");
    rewardToken = await TestToken.deploy(ethers.utils.parseEther("500000000000")); // 500 billion

    await marinate.addApprovedRewardToken(rewardToken.address);

    for (let i = 0; i < 5; i++) {
      await rewardToken.transfer(accounts[i].address, ethers.utils.parseEther("10000"));
      await sUMAMI.transfer(accounts[i].address, ethers.utils.parseUnits("1", 9));
    }
    await marinate.setMarinateLevel(0, 600, SCALE.mul(1)); // 10m, 1x
    await marinate.setMarinateLevel(1, 60 * 60 * 24 * 2, SCALE.mul(2)); // 2d, 2x
  });

  it("Stake - Early Withdraw", async function () {
    let amount = ethers.utils.parseUnits("1", 9);
    await sUMAMI.approve(marinate.address, amount);
    await marinate.stake(0, amount);
    await expect(marinate.withdraw(0)).to.be.revertedWith("Too soon");
  });

  it("Stake - Stake and Withdraw - No Rebase & Rewards", async function () {
    let amount = ethers.utils.parseUnits("1", 9);
    await sUMAMI.approve(marinate.address, amount);
    let bal = await rewardToken.balanceOf(owner.address);
    await marinate.stake(0, amount);
    await rewardToken.approve(marinate.address, amount);
    await marinate.addReward(rewardToken.address, amount);
    await fastForward(60 * 60 * 24);
    await marinate.withdraw(0);
    let rewardBal = await rewardToken.balanceOf(owner.address);
    expect(rewardBal, "Didn't collect full reward").to.be.equal(bal);
  });

  it("Stake - Stake and Withdraw - No Rebase or Rewards", async function () {
    let amount = ethers.utils.parseUnits("1", 9);
    await sUMAMI.approve(marinate.address, amount);
    let bal = await sUMAMI.balanceOf(owner.address);
    await marinate.stake(0, amount);
    await fastForward(60 * 60 * 24);
    await marinate.withdraw(0);
    let newBal = await sUMAMI.balanceOf(owner.address);
    expect(newBal, "Withdrew incorrect amount of sUMAMI").to.be.equal(bal);
  });

  it("Stake - Stake and Withdraw - Rebase & No Rewards", async function () {
    let amount = ethers.utils.parseUnits("1", 9);
    await sUMAMI.approve(marinate.address, amount);
    let bal = await sUMAMI.balanceOf(owner.address);
    await marinate.stake(0, amount);
    await fastForward(60 * 60 * 24);
    await coreContracts.staking.rebase();
    await marinate.withdraw(0);
    let newBal = await sUMAMI.balanceOf(owner.address);
    expect(newBal, "Didn't collect rebase").to.be.gt(bal);
  });

  it("Stake - Stake and Double Withdraw", async function () {
    let amount = ethers.utils.parseUnits("1", 9);
    await sUMAMI.approve(marinate.address, amount);
    await marinate.stake(0, amount);
    await fastForward(60 * 60 * 24);
    await coreContracts.staking.rebase();
    await marinate.withdraw(0);
    await expect(marinate.withdraw(0)).to.be.revertedWith("Haven't staked");
  });

  it("Stake - Stake and Stake again", async function () {
    let amount = ethers.utils.parseUnits("33", 9);
    let amount2 = ethers.utils.parseUnits("10", 9);

    let bal = await sUMAMI.balanceOf(owner.address);

    await sUMAMI.approve(marinate.address, amount);
    await marinate.stake(0, amount);
    let unlockTime = (await marinate.marinatorInfo(owner.address, 0)).unlockTime;
    await fastForward(200);
    await sUMAMI.approve(marinate.address, amount2);
    await marinate.stake(0, amount2);
    let newUnlockTime = (await marinate.marinatorInfo(owner.address, 0)).unlockTime;
    expect(newUnlockTime, "Unlock time not extended").to.be.closeTo(unlockTime + 200, 5);

    await fastForward(650);
    await marinate.withdraw(0);
    let newBal = await sUMAMI.balanceOf(owner.address);
    expect(newBal, "Didn't withdraw expected amount").to.be.closeTo(bal, 10);
  });

  it("Rewards - 50/50 rewards", async function () {
    let amount = ethers.utils.parseUnits("1", 9);
    let rewardAmount = ethers.utils.parseEther("100");

    let preBal = await rewardToken.balanceOf(accounts[1].address);
    
    await sUMAMI.connect(accounts[0]).approve(marinate.address, amount);
    await sUMAMI.connect(accounts[1]).approve(marinate.address, amount);
    await marinate.connect(accounts[0]).stake(0, amount);
    await marinate.connect(accounts[1]).stake(0, amount);
    
    await rewardToken.approve(marinate.address, rewardAmount);
    await marinate.addReward(rewardToken.address, rewardAmount);
    await fastForward(60 * 11);

    await marinate.connect(accounts[1]).withdraw(0);
    let postBal = await rewardToken.balanceOf(accounts[1].address);
    expect(postBal).to.be.closeTo(preBal.add(ethers.utils.parseEther("50")), 1);
  });

  it("Rewards - 75/25 rewards", async function () {
    let amount0 = ethers.utils.parseUnits("3", 9);
    let amount1 = ethers.utils.parseUnits("1", 9);
    let rewardAmount = ethers.utils.parseEther("100");

    let preBal = await rewardToken.balanceOf(accounts[0].address);
    
    await sUMAMI.connect(accounts[0]).approve(marinate.address, amount0);
    await sUMAMI.connect(accounts[1]).approve(marinate.address, amount1);
    await marinate.connect(accounts[0]).stake(0, amount0);
    await marinate.connect(accounts[1]).stake(0, amount1);
    
    await rewardToken.approve(marinate.address, rewardAmount);
    await marinate.addReward(rewardToken.address, rewardAmount);
    await fastForward(60 * 11);

    await marinate.connect(accounts[0]).withdraw(0);

    let postBal = await rewardToken.balanceOf(accounts[0].address);
    expect(postBal).to.be.closeTo(preBal.add(ethers.utils.parseEther("75")), 1);
  });

  it("Rewards - 50/50 rewards - 1/3 multipliers", async function () {
    let amount = ethers.utils.parseUnits("1", 9);
    let rewardAmount = ethers.utils.parseEther("100");
    let multiplier = ethers.utils.parseUnits("3", 40);

    let preBal0 = await rewardToken.balanceOf(accounts[0].address);
    let preBal1 = await rewardToken.balanceOf(accounts[1].address);
    
    await sUMAMI.connect(accounts[0]).approve(marinate.address, amount);
    await sUMAMI.connect(accounts[1]).approve(marinate.address, amount);
    await marinate.connect(accounts[0]).stake(0, amount);
    await marinate.setMarinateLevel(1337, 600, multiplier);
    await marinate.connect(accounts[1]).stake(1337, amount);
    
    await rewardToken.approve(marinate.address, rewardAmount);
    await marinate.addReward(rewardToken.address, rewardAmount);
    await fastForward(60 * 11);

    await marinate.connect(accounts[0]).withdraw(0);
    await marinate.connect(accounts[1]).withdraw(1337);
    let postBal0 = await rewardToken.balanceOf(accounts[0].address);
    let postBal1 = await rewardToken.balanceOf(accounts[1].address);
    expect(postBal0).to.be.closeTo(preBal0.add(ethers.utils.parseEther("25")), 1);
    expect(postBal1).to.be.closeTo(preBal1.add(ethers.utils.parseEther("75")), 1);
  });

  it("Rewards - getAvailableTokenRewards", async function () {
    let amount = ethers.utils.parseUnits("1", 9);
    let rewardAmount = ethers.utils.parseEther("100");
    let multiplier = ethers.utils.parseUnits("3", 40);

    let preBal0 = await rewardToken.balanceOf(accounts[0].address);
    let preBal1 = await rewardToken.balanceOf(accounts[1].address);
    
    await sUMAMI.connect(accounts[0]).approve(marinate.address, amount);
    await sUMAMI.connect(accounts[1]).approve(marinate.address, amount);
    await marinate.connect(accounts[0]).stake(0, amount);
    await marinate.setMarinateLevel(1337, 600, multiplier);
    await marinate.connect(accounts[1]).stake(1337, amount);
    
    await rewardToken.approve(marinate.address, rewardAmount);
    await marinate.addReward(rewardToken.address, rewardAmount);
    await fastForward(60 * 11);

    let postBal0 = await marinate.connect(accounts[0]).withdraw(0);
    let postBal1 = await marinate.connect(accounts[1]).withdraw(0);
    expect(postBal0).to.be.closeTo(preBal0.add(ethers.utils.parseEther("25")), 1);
    expect(postBal1).to.be.closeTo(preBal1.add(ethers.utils.parseEther("75")), 1);
  });

  it("Rewards - 50/50 rewards - equal multipliers", async function () {
    let amount = ethers.utils.parseUnits("1", 9);
    let rewardAmount = ethers.utils.parseEther("100");
    let multiplier = ethers.utils.parseUnits("3", 40);

    let preBal0 = await rewardToken.balanceOf(accounts[0].address);
    let preBal1 = await rewardToken.balanceOf(accounts[1].address);
    
    await sUMAMI.connect(accounts[0]).approve(marinate.address, amount);
    await sUMAMI.connect(accounts[1]).approve(marinate.address, amount);
    await marinate.connect(accounts[0]).stake(1, amount);
    await marinate.connect(accounts[1]).stake(1, amount);
    
    await rewardToken.approve(marinate.address, rewardAmount);
    await marinate.addReward(rewardToken.address, rewardAmount);
    await fastForward(60 * 60 * 24 * 3);

    await marinate.connect(accounts[0]).withdraw(1);
    await marinate.connect(accounts[1]).withdraw(1);
    let postBal0 = await rewardToken.balanceOf(accounts[0].address);
    let postBal1 = await rewardToken.balanceOf(accounts[1].address);
    expect(postBal0).to.be.closeTo(preBal0.add(ethers.utils.parseEther("50")), 1);
    expect(postBal1).to.be.closeTo(preBal1.add(ethers.utils.parseEther("50")), 1);
  });

  it("Rewards - getAvailableTokenRewards 1", async function () {
    let amount = ethers.utils.parseUnits("1", 9);
    let rewardAmount = ethers.utils.parseEther("100");

    await sUMAMI.connect(accounts[0]).approve(marinate.address, amount);
    await sUMAMI.connect(accounts[1]).approve(marinate.address, amount);
    await marinate.connect(accounts[0]).stake(0, amount);
    await marinate.connect(accounts[1]).stake(0, amount);
    
    await rewardToken.approve(marinate.address, rewardAmount);
    await marinate.addReward(rewardToken.address, rewardAmount);

    let avail1 = await marinate.connect(accounts[0]).getAvailableTokenRewards(accounts[0].address, rewardToken.address, 0);
    let avail2 = await marinate.connect(accounts[1]).getAvailableTokenRewards(accounts[1].address, rewardToken.address, 0);
    expect(avail1).to.be.closeTo(ethers.utils.parseEther("50"), 1);
    expect(avail2).to.be.closeTo(ethers.utils.parseEther("50"), 1);
  });


  it("Rewards - getAvailableTokenRewards 2", async function () {
    let amount = ethers.utils.parseUnits("1", 9);
    let rewardAmount = ethers.utils.parseEther("100");

    await sUMAMI.connect(accounts[0]).approve(marinate.address, amount);
    await sUMAMI.connect(accounts[1]).approve(marinate.address, amount);
    await marinate.connect(accounts[0]).stake(0, amount);
    await marinate.connect(accounts[1]).stake(0, amount);
    
    await rewardToken.approve(marinate.address, rewardAmount.mul(2));
    await marinate.addReward(rewardToken.address, rewardAmount);
    await marinate.addReward(rewardToken.address, rewardAmount);

    let avail1 = await marinate.connect(accounts[0]).getAvailableTokenRewards(accounts[0].address, rewardToken.address, 0);
    let avail2 = await marinate.connect(accounts[1]).getAvailableTokenRewards(accounts[1].address, rewardToken.address, 0);
    expect(avail1).to.be.closeTo(ethers.utils.parseEther("100"), 1);
    expect(avail2).to.be.closeTo(ethers.utils.parseEther("100"), 1);
  });

  it("Rewards - getAvailableTokenRewards 3", async function () {
    let amount = ethers.utils.parseUnits("1", 9);
    let rewardAmount = ethers.utils.parseEther("100");

    await sUMAMI.connect(accounts[0]).approve(marinate.address, amount);
    await sUMAMI.connect(accounts[1]).approve(marinate.address, amount);
    await marinate.connect(accounts[0]).stake(0, amount);
    await marinate.connect(accounts[1]).stake(0, amount);
    
    await rewardToken.approve(marinate.address, rewardAmount);
    await marinate.addReward(rewardToken.address, rewardAmount);

    await sUMAMI.connect(accounts[0]).approve(marinate.address, amount);
    await sUMAMI.connect(accounts[1]).approve(marinate.address, amount);
    await marinate.connect(accounts[0]).stake(0, amount);
    await marinate.connect(accounts[1]).stake(0, amount);

    await rewardToken.approve(marinate.address, rewardAmount.mul(2));
    await marinate.addReward(rewardToken.address, rewardAmount.mul(2));

    let avail1 = await marinate.connect(accounts[0]).getAvailableTokenRewards(accounts[0].address, rewardToken.address, 0);
    let avail2 = await marinate.connect(accounts[1]).getAvailableTokenRewards(accounts[1].address, rewardToken.address, 0);
    expect(avail1).to.be.closeTo(ethers.utils.parseEther("150"), 10);
    expect(avail2).to.be.closeTo(ethers.utils.parseEther("150"), 10);
  });

  it("Stake - Different Levels - Withdraw from shortest", async function () {
    let amount = ethers.utils.parseUnits("1", 8);
    
    await sUMAMI.approve(marinate.address, amount.mul(2));
    await marinate.stake(1, amount);
    await marinate.stake(0, amount);
    
    await fastForward(60 * 11);

    await marinate.withdraw(0);
    await expect(marinate.withdraw(1)).to.be.revertedWith("Too soon");
  });

  it("Stake - No hanging rewards (excessTokenRewards)", async function () {
    let amount = ethers.utils.parseUnits("1", 8);
    
    await sUMAMI.approve(marinate.address, amount.mul(2));

    await marinate.stake(0, amount);
    await fastForward(60 * 11);
    await marinate.withdraw(0);

    await rewardToken.approve(marinate.address, amount);
    await marinate.addReward(rewardToken.address, amount);
    let withdrawBal0 = await rewardToken.balanceOf(owner.address);

    await marinate.stake(0, amount);
    await fastForward(60 * 11);
    await marinate.withdraw(0);
    
    let withdrawBal1 = await rewardToken.balanceOf(owner.address);

    expect(await marinate.excessTokenRewards(rewardToken.address), "Not added to excessTokenRewards").to.be.equal(amount);
  });

  it("Stake - Different Levels - Withdraw from both", async function () {
    let amount = ethers.utils.parseUnits("1", 8);

    let preBal = await sUMAMI.balanceOf(owner.address);
    
    await sUMAMI.approve(marinate.address, amount.mul(2));
    await marinate.stake(1, amount);
    await marinate.stake(0, amount);
    
    await fastForward(60 * 60 * 24 * 2);

    await marinate.withdraw(0);
    await marinate.withdraw(1);
    let postBal = await sUMAMI.balanceOf(owner.address);
    expect(postBal, "Couldn't withdraw all staked balance").to.be.closeTo(preBal, 2);
  });

  it("Add Reward Token", async function () {
    await marinate.addApprovedRewardToken(sUMAMI.address);

    expect(await marinate.isApprovedRewardToken(sUMAMI.address)).to.be.equal(true);
  });

  it("RemoveReward Token", async function () {
    await marinate.removeApprovedRewardToken(UMAMI.address);

    expect(await marinate.isApprovedRewardToken(UMAMI.address)).to.be.equal(false);
  });

  it("Add Reward Token - No duplicates", async function () {
    await expect(marinate.addApprovedRewardToken(UMAMI.address)).to.be.revertedWith("Reward token exists");
  });

  it("Receiver - UMAMI is wrapped", async function () {
    await marinateReceiver.addDistributedToken(UMAMI.address);
    await UMAMI.transfer(marinateReceiver.address, ethers.utils.parseUnits("100", 9));
    await marinate.addApprovedRewardToken(wsUMAMI.address);
    await marinateReceiver.sendBalancesAsRewards();
    expect(await marinate.excessTokenRewards(wsUMAMI.address), "Not added to excessTokenRewards").to.be.gt(0);
  });

});