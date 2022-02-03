require("dotenv").config();

require("@nomiclabs/hardhat-etherscan");
require("@nomiclabs/hardhat-waffle");
require("hardhat-gas-reporter");
require("solidity-coverage");

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async (taskArgs, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: "0.8.4",
  networks: {
    ropsten: {
      url: process.env.ROPSTEN_URL || "",
      accounts: process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    ganache: {
      url: `HTTP://0.0.0.0:7545`,
      accounts: process.env.GANACHE_KEY !== undefined ? [process.env.GANACHE_KEY, process.env.GANACHE_KEY2] : [],
    },
    arbitrum_rinkeby: {
      url: "https://arbitrum-rinkeby.infura.io/v3/c4391fb7499c4423b6e8a62e0e87359d",
      accounts: process.env.RINKEBY_KEY !== undefined ? [process.env.RINKEBY_KEY] : [],
    },
    hardhat: {
      allowUnlimitedContractSize: true,
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD",
    src: "./contracts",
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    artifacts: "./artifacts",
    cache: "./cache",
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
};
