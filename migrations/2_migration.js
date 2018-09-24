const NOIAToken = artifacts.require('NOIAToken');
const NOIACrowdsale = artifacts.require('NOIACrowdsale');
const Whitelist = artifacts.require('Whitelist');
const ChannelOperator = artifacts.require('ChannelOperator');
const EIP820Registry = require("eip820");

const truffleConfig = require('../truffle.js');

module.exports = function (deployer, network, accounts) {
  // get the provider url for web3.js 1.0 module
  const provider = truffleConfig.networks[network].provider();
  console.log(`Provider url:`, provider.url);
  let providerUrl = 'http://localhost:8545';
  if (provider && provider.url) {
    providerUrl = provider.url;
  }

  // print out the accounts and eth balances
  console.log(`Accounts:`, accounts);
  const Web3Latest = require("web3");
  const web3latest = new Web3Latest(providerUrl);
  for (let i=0; i < accounts.length; i++) {
    const account = accounts[i];
    web3latest.eth.getBalance(account).then((balance) => {
      console.log(`Account: ${account}, ETH Balance: ${Web3Latest.utils.fromWei(balance, "ether")}`);
    }).catch((err) => {
      console.log(err);
    });
  }

  console.log('Deploying Whitelist ...');
  deployer.deploy(Whitelist).then(() => {
    if (network === 'development' || network === 'ropsten') {
      console.log(`Deploying EIP820 registry`);
      return EIP820Registry.deploy(web3latest, accounts[0]);
    } else {
      return null;
    }
  })
    .then(() => deployer.deploy(NOIAToken))
    .then(() => deployer.deploy(NOIACrowdsale, NOIAToken.address, Whitelist.address))
    .then(() => deployer.deploy(ChannelOperator, NOIAToken.address))
    .then(() => NOIAToken.deployed())
    .then(token => token.transferOwnership(NOIACrowdsale.address));
};
