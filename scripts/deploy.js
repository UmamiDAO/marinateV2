// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require("hardhat");

async function main() {
  const _MarinateV2 = await ethers.getContractFactory("MarinateV2");
  const _TestUMAMU = await ethers.getContractFactory("MockERC20");
  const _MarinateV2Strategy = await ethers.getContractFactory("MarinateV2");
  let umami = await _TestUMAMU.deploy("UMAMI", "UMAMI");
  let MarinateV2 = await _MarinateV2.deploy(umami.address, "Marinated UMAMI", "mUMAMI", "50000000000000");


  //console.log("UMAMI token deployed to:", umami.address);
  console.log("MarinateV2 deployed to:", MarinateV2.address);
  console.log("umami token deployed to:", umami.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
//npx hardhat verify --network arbitrum_rinkeby --constructor-args arguments.js 0xe46B87cf25b1ECb287fA5B5E3f5d9f60528b7E28
// 50000000000000
// 70000000000000
// npx hardhat run --network arbitrum scripts/deploy.js
// 3826.6369
//MarinateV2 deployed to: 0xe46B87cf25b1ECb287fA5B5E3f5d9f60528b7E28
//umami token deployed to: 0x4184003a58EA00003D6a8589B4D244CcBd328e54
//


/*
arbitrum rinkeby

MarinateV2 deployed to: 0x73bB8995bfF21645085A97b7b515b0ABBA501D2b
umami token deployed to: 0xebB76e9f451Da7bf188402B958e31C184845BcaD

*/