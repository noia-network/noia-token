const Web3 = require('web3-hdwallet-provider/web3');
const Web3HDWalletProvider = require("web3-hdwallet-provider");
const path = require('path');
let config = {
  networks: {}
};
try {
  config = require('./truffle-config.js');
} catch (e) {
  console.warn('config.js not available or returned error', e);
}

// NOTE! Configure your ganache with the same mnemonic for the accounts to have an eth
let mnemonic = 'ill song party come kid carry calm captain state purse weather ozone';
// check if mnemonic is provided via env
if (process.env.MNEMONIC) {
  mnemonic = process.env.MNEMONIC;
  console.log(`Provided mnemonic: ${mnemonic}`);
}
let provider;

module.exports = {
  // See <http://truffleframework.com/docs/advanced/configuration>
  // to customize your Truffle configuration!
  networks: Object.assign({}, config.networks, {
    development: {
      provider: () => {
        // if provider is already initialized (multiple calls to provider() can happen) then return it
        if (provider) {
          return provider;
        }

        // const providerUrl = 'http://eth.oja.me:3304/';
        const providerUrl = 'http://127.0.0.1:7545';
        provider = new Web3HDWalletProvider(
            new Web3.providers.HttpProvider(providerUrl),
            mnemonic,
          0, 3);
        provider.url = providerUrl;
        return provider;
      },
      network_id: "*", // Match any network id
      gas: 6713094
    },
    ropsten: {
      provider: () => {
        // if provider is already initialized (multiple calls to provider() can happen) then return it
        if (provider) {
          return provider;
        }

        // build the provider
        // const providerUrl = 'http://eth.oja.me:3304/';
        const providerUrl = 'https://d1xsa1mf7dtpee.cloudfront.net/dev';
        provider = new Web3HDWalletProvider(
          new Web3.providers.HttpProvider(providerUrl),
          mnemonic,
          0, 3);
        provider.url = providerUrl;
        return provider;
      },
      network_id: '3', // NOTE!! network_id '*' is not supported by the hdwallet
      gas: 6713094
    }
  }),

  solc: {
    optimizer: {
      enabled: true,
      runs: 200
    }
  }
};
