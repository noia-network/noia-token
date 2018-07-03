const BigNumber = web3.BigNumber;

const chai = require('chai');
chai.use(require('chai-as-promised'));
chai.use(require('chai-bignumber')(BigNumber));

const expect = chai.expect;

const OneToken = new BigNumber(web3.toWei(1, 'ether'));

const TokenRecoverable = artifacts.require('TokenRecoverable');
const TestToken = artifacts.require('TestToken');

contract('Token Recoverable', async accounts => {
    const user1 = accounts[1];
    let token;
    let recoverable;

    before(async () => {
        [token, recoverable] = await Promise.all([TestToken.new(), TokenRecoverable.new()]);
        await token.mint(recoverable.address, OneToken.mul(10));
    });

    it('recoverable has tokens', async () => {
        expect(await token.balanceOf(recoverable.address)).bignumber.equal(OneToken.mul(10));
    });

    it('user1 does not have balance', async () => {
        expect(await token.balanceOf(user1)).bignumber.equal(0);
    });

    it('should recover', async () => {
        await recoverable.recoverTokens(token.address, user1, OneToken.mul(10));

        expect(await token.balanceOf(user1)).bignumber.equal(OneToken.mul(10));
    });
});