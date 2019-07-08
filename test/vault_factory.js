const BN = web3.utils.BN;

require('chai')
  .use(require('chai-as-promised'))
  .use(require('chai-bn')(BN))
  .should();

const { getTime, increaseTime, nextBlock } = require('./utils.js');

const OneToken = new BN(web3.utils.toWei('1', 'ether'));

const NOIAToken = artifacts.require('NOIAToken');
const NOIAVault = artifacts.require('NOIAVault');
const NOIAVaultFactory = artifacts.require('NOIAVaultFactory');

contract('NOIA Vault Factory', async accounts => {
  const admin = accounts[0];
  const user1 = accounts[1];
  const user2 = accounts[2];
  let token;
  let factory;
  let now;

  async function createVault(user, lockTill) {
    const tx = await factory.createVault(user, lockTill);
    const vaultAddress = tx.logs[0].args.vaultAddress;
    return NOIAVault.at(vaultAddress);
  }

  beforeEach(async () => {
    await nextBlock();
    now = await getTime();
    token = await NOIAToken.new();
    const vault = await NOIAVault.new();
    factory = await NOIAVaultFactory.new(vault.address, token.address);
  });

  describe('create()', () => {
    it('should create vault', async () => {
      const vault = await createVault(user1, now + 100);

      (await vault.beneficiary()).should.equal(user1);
      (await vault.lockTill()).should.bignumber.equal(new BN(now + 100));
    });

    it('should refuse to initialize vault again', async () => {
      const vault = await createVault(user1, now + 100);

      await vault.initialize(user2, now + 100, token.address).should.be.rejected;
    });

    it('should not lock tokens to zero address', async () => {
      await factory.createVault('0x0', now + 100).should.be.rejected;
    });

    it('should not lock tokens in the past', async () => {
      await factory.createVault(user1, now - 100).should.be.rejected;
    });
  });

  describe('release', async () => {
    let vault;
    beforeEach(async () => {
      await token.mint(admin, OneToken.mul(new BN('10')));
      vault = await createVault(user1, now + 100);
    });

    it('should not release when transfering until lock time', async () => {
      await token.transfer(vault.address, OneToken);

      (await token.balanceOf(user1)).should.bignumber.equal('0');
      (await token.balanceOf(vault.address)).should.bignumber.equal(OneToken);
    });

    it('should not release until lock time', async () => {
      await token.transfer(vault.address, OneToken);

      await vault.release();

      (await token.balanceOf(user1)).should.bignumber.equal('0');
      (await token.balanceOf(vault.address)).should.bignumber.equal(OneToken);
    });

    it('should release when lock time passes', async () => {
      await token.transfer(vault.address, OneToken);
      await increaseTime(101);

      await vault.release();

      (await token.balanceOf(vault.address)).should.bignumber.equal('0');
      (await token.balanceOf(user1)).should.bignumber.equal(OneToken);
    });

    it('should release all balance when transfering token to vault and lock time passes', async () => {
      await token.transfer(vault.address, OneToken);
      await increaseTime(101);

      await token.transfer(vault.address, '1');

      (await token.balanceOf(vault.address)).should.bignumber.equal('0');
      (await token.balanceOf(user1)).should.bignumber.equal(OneToken.add(new BN('1')));
    });

    it('should release when transfering 0 tokens to vault and lock time passes', async () => {
      await token.transfer(vault.address, OneToken);
      await increaseTime(101);

      await token.transfer(vault.address, '0');

      (await token.balanceOf(vault.address)).should.bignumber.equal('0');
      (await token.balanceOf(user1)).should.bignumber.equal(OneToken);
    });

    it('should return totalBalanceOf() of single lock', async () => {
      await token.transfer(vault.address, OneToken);

      (await factory.totalBalanceOf(user1)).should.bignumber.equal(OneToken);
    });

    it('should return totalBalanceOf() of multiple locks', async () => {
      const vault2 = await createVault(user1, now + 200);
      await token.transfer(vault.address, OneToken);
      await token.transfer(vault2.address, OneToken);

      (await factory.totalBalanceOf(user1)).should.bignumber.equal(OneToken.mul(new BN('2')));
    });

    it('should return unlockableBalanceOf() of zero before lock time', async () => {
      await token.transfer(vault.address, OneToken);

      (await factory.unlockableBalanceOf(user1)).should.bignumber.equal('0');
    });

    it('should return unlockableBalanceOf() of single lock', async () => {
      await token.transfer(vault.address, OneToken);

      await increaseTime(101);

      (await factory.unlockableBalanceOf(user1)).should.bignumber.equal(OneToken);
    });

    it('should return unlockableBalanceOf() of multiple locks', async () => {
      const vault2 = await createVault(user1, now + 200);
      await token.transfer(vault.address, OneToken);
      await token.transfer(vault2.address, OneToken);
      await increaseTime(201);

      (await factory.unlockableBalanceOf(user1)).should.bignumber.equal(OneToken.mul(new BN('2')));
    });

    it('should partially release locked tokens', async () => {
      const vault2 = await createVault(user1, now + 200);
      await token.transfer(vault.address, OneToken);
      await token.transfer(vault2.address, OneToken);
      await increaseTime(101);

      await factory.release(user1);
      
      (await token.balanceOf(user1)).should.bignumber.equal(OneToken);
    });

    it('should release all locked tokens', async () => {
      const vault2 = await createVault(user1, now + 200);
      await token.transfer(vault.address, OneToken);
      await token.transfer(vault2.address, OneToken);
      await increaseTime(201);

      await factory.release(user1);
      
      (await token.balanceOf(user1)).should.bignumber.equal(OneToken.mul(new BN('2')));
    });
  });

});