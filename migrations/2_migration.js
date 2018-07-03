const NOIAToken = artifacts.require('NOIAToken')
const NOIACrowdsale = artifacts.require('NOIACrowdsale')
const Whitelist = artifacts.require('Whitelist')
const ChannelOperator = artifacts.require('ChannelOperator')
const EIP820Registry = require("eip820")

module.exports = function (deployer, network, accounts) {
    deployer.deploy(Whitelist).then(() => {
        if (network === 'development') {
            const Web3Latest = require("web3")
            const web3latest = new Web3Latest('http://localhost:8545')
            return EIP820Registry.deploy(web3latest, accounts[0])
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