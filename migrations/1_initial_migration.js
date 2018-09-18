var Migrations = artifacts.require("./Migrations.sol");

module.exports = function(deployer, network, accounts) {
  console.log(`Accounts:`, accounts);
  deployer.deploy(Migrations);
};
