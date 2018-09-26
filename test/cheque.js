const BigNumber = web3.BigNumber;

const leftpad = require('left-pad');
const util = require('ethjs-util');

require('chai')
  .use(require('chai-as-promised'))
  .use(require('chai-bignumber')(BigNumber))
  .should();

const OneToken = new BigNumber(web3.toWei(1, 'ether'));

const NOIAToken = artifacts.require('NOIAToken');
const EmptyContract = artifacts.require('TestEmptyContract');

function sign(signer, to, value, fee, data, nonce, tokenAddress, legacy) {
  const hexData = [
    tokenAddress.slice(2),
    to.slice(2),
    leftpad((value).toString(16), 64, 0),
    leftpad((fee).toString(16), 64, 0),
    data,
    leftpad((nonce).toString(16), 64, 0),
    legacy ? util.stripHexPrefix(util.fromUtf8('ERC20Compat')) : ''
  ].join('');

  const msg = web3.sha3(hexData, {
    encoding: 'hex'
  });

  return new Promise((resolve, reject) => {
    web3.eth.sign(signer, msg, (error, result) => {
      if (error) {
        return reject(error);
      }
      return resolve(result);
    });
  });
}

contract('Send By Cheque', async accounts => {
  const admin = accounts[0];
  const user1 = accounts[1];
  const user2 = accounts[2];
  let token;

  before(async () => {
    token = await NOIAToken.new();
    await token.mint(admin, OneToken.mul(100));
    await token.finishMinting();
  });

  it('users should have zero balance', async () => {
    (await token.balanceOf(user1)).should.be.bignumber.equal(0);
    (await token.balanceOf(user2)).should.be.bignumber.equal(0);
  });

  it('should be possible to withdraw cheque', async () => {
    const nonce = 0;
    const signature = await sign(admin, user1, OneToken, OneToken.mul(0.01), '', nonce, token.address);

    await token.sendByCheque(user1, OneToken, OneToken.mul(0.01), '', nonce, signature, {
      from: user2
    });

    (await token.balanceOf(user1)).should.be.bignumber.equal(OneToken);
    (await token.balanceOf(user2)).should.be.bignumber.equal(OneToken.mul(0.01));
  });

  it('should not be possible to withdraw cheque with same nonce', async () => {
    const nonce = 0;
    const signature = await sign(admin, user1, OneToken, OneToken.mul(0.01), '', nonce, token.address);

    await token.sendByCheque(user1, OneToken, OneToken.mul(0.01), '', nonce, signature, {
      from: user1
    }).should.be.rejected;
  });

  it('should not be possible to withdraw with wrong token', async () => {
    const balance = await token.balanceOf(user1);
    const nonce = 1;
    const signature = await sign(admin, user1, OneToken, OneToken.mul(0.01), '', nonce, '0x0');
    await token.sendByCheque(user1, OneToken, OneToken.mul(0.01), '', nonce, signature, {
      from: user1
    }).should.be.rejected;
    (await token.balanceOf(user1)).should.be.bignumber.equal(balance)
  });

  it('should not be possible to withdraw with wrong user', async () => {
    const balance = await token.balanceOf(user1);
    const nonce = 1;
    const signature = await sign(admin, user2, OneToken, OneToken.mul(0.01), '', nonce, token.address);
    await token.sendByCheque(user1, OneToken, OneToken.mul(0.01), '', nonce, signature, {
      from: user1
    }).should.be.rejected;
    (await token.balanceOf(user1)).should.be.bignumber.equal(balance)
  });

  it('should not be possible to withdraw with wrong value', async () => {
    const balance = await token.balanceOf(user2);
    const nonce = 1;
    const signature = await sign(admin, user2, OneToken, OneToken.mul(0.01), '', nonce, token.address);
    await token.sendByCheque(user2, OneToken.mul(2), OneToken.mul(0.01), '', nonce, signature, {
      from: user2
    }).should.be.rejected;
    (await token.balanceOf(user2)).should.be.bignumber.equal(balance)
  });

  it('should not be possible to withdraw with wrong fee', async () => {
    const balance = await token.balanceOf(user2);
    const nonce = 1;
    const signature = await sign(admin, user2, OneToken, OneToken.mul(0.01), '', nonce, token.address);
    await token.sendByCheque(user2, OneToken, OneToken, '', nonce, signature, {
      from: user2
    }).should.be.rejected;
    (await token.balanceOf(user2)).should.be.bignumber.equal(balance)
  });

  it('should not be possible to withdraw with wrong signature', async () => {
    const balance = await token.balanceOf(user1);
    const signature = 0;
    const nonce = 1;
    await token.sendByCheque(user2, OneToken, OneToken.mul(0.01), '', nonce, signature, {
      from: user1
    }).should.be.rejected;
    (await token.balanceOf(user1)).should.be.bignumber.equal(balance)
  });
});

contract('Transfer By Cheque', async accounts => {
  const admin = accounts[0];
  const user1 = accounts[1];
  const user2 = accounts[2];
  let token;
  let contract;

  before(async () => {
    console.log(`START`);
    token = await NOIAToken.new();
    contract = await EmptyContract.new();

    await token.mint(admin, OneToken.mul(100));
    await token.finishMinting();
    console.log(`END`);
  });

  it('empty contract should have no balance', async () => {
    (await token.balanceOf(contract.address)).should.be.bignumber.equal(0);
  });

  it('sendByCheque should fail to transfer tokens to incompatible contract', async () => {
    const nonce = 0;
    const signature = await sign(admin, contract.address, OneToken, OneToken.mul(0.01), '', nonce, token.address, true);

    await token.sendByCheque(contract.address, OneToken, OneToken.mul(0.01), '', nonce, signature, {
      from: user2
    }).should.be.rejected;
  });

  it('transferByCheque should transfer tokens to incompatible contract', async () => {
    const nonce = 0;
    const signature = await sign(admin, contract.address, OneToken, OneToken.mul(0.01), '', nonce, token.address, true);

    await token.transferByCheque(contract.address, OneToken, OneToken.mul(0.01), '', nonce, signature, {
      from: user2
    });

    (await token.balanceOf(contract.address)).should.be.bignumber.equal(OneToken);
    (await token.balanceOf(user2)).should.be.bignumber.equal(OneToken.mul(0.01));
  });
});
