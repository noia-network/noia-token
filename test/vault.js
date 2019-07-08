const BN = web3.utils.BN;

require('chai')
  .use(require('chai-as-promised'))
  .use(require('chai-bn')(BN))
  .should();

const { getTime, increaseTime } = require('./utils.js');

const OneToken = new BN(web3.utils.toWei('1', 'ether'));

const NOIAToken = artifacts.require('NOIAToken');
const NOIAVault = artifacts.require('NOIAVault');

contract('NOIA Vault', async accounts => {
  const admin = accounts[0];
  const user1 = accounts[1];
  const user2 = accounts[2];
  let token;
  let vault;
  let now;

  beforeEach(async () => {
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

    describe('release', async () => {
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
});