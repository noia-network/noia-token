const BN = web3.utils.BN;

require('chai')
  .use(require('chai-as-promised'))
  .use(require('chai-bn')(BN))
  .should();

const { getTime, increaseTime, nextBlock } = require('./utils.js');

const OneToken = new BN(web3.utils.toWei('1', 'ether'));

const NOIAToken = artifacts.require('NOIAToken');
const NOIAVault = artifacts.require('NOIAVault');
const ERC20 = artifacts.require('TestERC20Token');

contract('NOIA Vault', async accounts => {
  const admin = accounts[0];
  const user1 = accounts[1];
  const user2 = accounts[2];
  let token;
  let vault;
  let now;

  beforeEach(async () => {
    await nextBlock();
    now = await getTime();
    token = await NOIAToken.new();
    vault = await NOIAVault.new();
  });

  describe('initialize()', () => {
    it('should initialize vault', async () => {
      await vault.initialize(user1, now + 100, token.address);

      (await vault.beneficiary()).should.equal(user1);
      (await vault.lockTill()).should.bignumber.equal(new BN(now + 100));
    });

    it('should refuse to initialize vault again', async () => {
      await vault.initialize(user1, now + 100, token.address);

      await vault.initialize(user2, now + 100, token.address).should.be.rejected;
    });

    it('should not lock tokens to zero address', async () => {
      await vault.initialize('0x0', now + 100, token.address).should.be.rejected;
    });

    it('should not lock tokens in the past', async () => {
      await vault.initialize(user1, now - 100, token.address).should.be.rejected;
    });
  });

  describe('release()', () => {
    beforeEach(async () => {
      await token.mint(admin, OneToken.mul(new BN('10')));
    });

    it('should not release when transfering until lock time', async () => {
      await vault.initialize(user1, now + 1000, token.address);

      await token.transfer(vault.address, OneToken);

      (await token.balanceOf(user1)).should.bignumber.equal('0');
      (await token.balanceOf(vault.address)).should.bignumber.equal(OneToken);
    });

    it('should not release until lock time', async () => {
      await vault.initialize(user1, now + 1000, token.address);
      await token.transfer(vault.address, OneToken);

      await vault.release();

      (await token.balanceOf(user1)).should.bignumber.equal('0');
      (await token.balanceOf(vault.address)).should.bignumber.equal(OneToken);
    });

    it('should release when lock time passes', async () => {
      await vault.initialize(user1, now + 1000, token.address);
      await token.transfer(vault.address, OneToken);
      await increaseTime(1001);

      await vault.release();

      (await token.balanceOf(vault.address)).should.bignumber.equal('0');
      (await token.balanceOf(user1)).should.bignumber.equal(OneToken);
    });

    it('should release all balance when transfering token to vault and lock time passes', async () => {
      await vault.initialize(user1, now + 1000, token.address);
      await token.transfer(vault.address, OneToken);
      await increaseTime(1001);

      await token.transfer(vault.address, '1');

      (await token.balanceOf(vault.address)).should.bignumber.equal('0');
      (await token.balanceOf(user1)).should.bignumber.equal(OneToken.add(new BN('1')));
    });

    it('should release when transfering 0 tokens to vault and lock time passes', async () => {
      await vault.initialize(user1, now + 1000, token.address);
      await token.transfer(vault.address, OneToken);
      await increaseTime(1001);

      await token.transfer(vault.address, '0');

      (await token.balanceOf(vault.address)).should.bignumber.equal('0');
      (await token.balanceOf(user1)).should.bignumber.equal(OneToken);
    });
  });

  describe('recoverTokens()', () => {
    let erc20;
    beforeEach(async () => {
      await vault.initialize(user1, now + 100, token.address);
      erc20 = await ERC20.new();
      await erc20.mint(admin, OneToken.mul(new BN('10')));
      await token.mint(admin, OneToken.mul(new BN('10')));
    });

    it('should recover ERC20 tokens', async () => {
      await erc20.transfer(vault.address, OneToken);

      await vault.recoverTokens(erc20.address, user1, OneToken);

      (await erc20.balanceOf(user1)).should.bignumber.equal(OneToken);
    });

    it('stranger should not recover ERC20 tokens', async () => {
      await erc20.transfer(vault.address, OneToken);

      await vault.recoverTokens(erc20.address, user1, OneToken, { from: user1 }).should.be.rejected;
    });

    it('should not recover NOIA tokens', async () => {
      await token.transfer(vault.address, OneToken);

      await vault.recoverTokens(token.address, user1, OneToken).should.be.rejected;
    });
  });
});