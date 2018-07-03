const BigNumber = web3.BigNumber;

const chai = require('chai');
chai.use(require('chai-as-promised'));
chai.use(require('chai-bignumber')(BigNumber));

const expect = chai.expect;

const OneEther = new BigNumber(web3.toWei(1, 'ether'));
const OneToken = new BigNumber(web3.toWei(1, 'ether'));
const OneUSD = new BigNumber(web3.toWei(1, 'ether'));

const NOIACrowdsale = artifacts.require('TestNOIACrowdsale');
const NOIAToken = artifacts.require('NOIAToken');
const Whitelist = artifacts.require('Whitelist');


contract('NOIACrowdsale Complex', async accounts => {
    const user1 = accounts[1];
    const user2 = accounts[2];
    let contract;
    let token;
    let whitelist;
    let start;
    let end;
    before(async () => {
        [token, whitelist] = await Promise.all([NOIAToken.new(), Whitelist.new()]);
        contract = await NOIACrowdsale.new(token.address, whitelist.address);
        await token.transferOwnership(contract.address);
        await contract.setNow(0);
        [start, end] = await Promise.all([contract.START_TIME(), contract.END_TIME()]);
        await whitelist.addAddress(user1);
    });

    it('should manually mint tokens', async () => {
        let receivers = [];
        let amounts = [];
        for (let i = 0; i < 100; i++) {
            receivers.push(user1);
            amounts.push(OneToken);
        }
        await expect(contract.mintTokens(receivers, amounts)).eventually.fulfilled;

        expect(await token.balanceOf(user1)).bignumber.equal(OneToken.mul(100));
    });

    it('manual minting moves stages', async () => {
        const stageBefore = await contract.currentStage();

        let receivers = [];
        let amounts = [];
        for (let i = 0; i < 100; i++) {
            receivers.push(user1);
            amounts.push(OneToken.mul(600001));
        }
        await expect(contract.mintTokens(receivers, amounts)).eventually.fulfilled;

        expect(await token.balanceOf(user1)).bignumber.equal(OneToken.mul(600001).mul(100).add(OneToken.mul(100)));
        expect(stageBefore).bignumber.equal(0);
        expect(await contract.currentStage()).bignumber.equal(1);
    });

    it('should start crowdsale', async () => {
        await contract.setNow(start.add(1));
    });

    it('should not accept too small payments', async () => {
        await expect(contract.sendTransaction({
            from: user1,
            value: OneEther.mul(0.01),
            gas: 300000
        })).eventually.rejected;
    });

    it('should refund when trying to send too many ethers', async () => {
        const tokenBalance = await token.balanceOf(user1);
        const balance = new BigNumber(await web3.eth.getBalance(user1));

        await contract.sendTransaction({
            from: user1,
            value: OneEther.mul(100),
            gas: 300000
        });

        const balanceAfter = new BigNumber(await web3.eth.getBalance(user1));

        expect(await token.balanceOf(user1)).bignumber.equal(tokenBalance);
        expect(balance.sub(balanceAfter)).bignumber.below(OneEther);
    });

    it('should not allow to send too many ethers', async () => {
        const tx1 = await contract.sendTransaction({
            from: user1,
            value: OneEther.mul(5),
            gas: 300000
        });
        const tx2 = await contract.sendTransaction({
            from: user1,
            value: OneEther.mul(10),
            gas: 300000
        });
        const tx3 = await contract.sendTransaction({
            from: user1,
            value: OneEther.mul(10),
            gas: 300000
        });

        expect(tx1.logs[tx1.logs.length - 1].event).not.equal('PurchaseLimitReached');
        expect(tx2.logs[tx2.logs.length - 1].event).not.equal('PurchaseLimitReached');
        expect(tx3.logs[tx3.logs.length - 1].event).equal('PurchaseLimitReached');
    });

    it('stranger cannot call setMaxPurchaseUsd()', async () => {
        await expect(contract.setMaxPurchaseUsd(OneUSD.mul(100000000), { from: user2 })).rejected;
    });

    it('only owner can call setMaxPurchaseUsd()', async () => {
        await contract.setMaxPurchaseUsd(OneUSD.mul(100000000));
        expect(await contract.maxPurchaseUsd()).bignumber.equal(OneUSD.mul(100000000));
    });

    it('ether transfers moves multiple stages', async () => {
        await contract.sendTransaction({
            from: user1,
            value: OneEther.mul(12000),
            gas: 300000
        });
    
        expect(await contract.currentStage()).bignumber.equal(3);
    });

    it('should be possible to mint after ICO end and before finalize', async () => {
        await contract.setNow(end.add(10));

        const balanceBefore = await token.balanceOf(user1);
        await expect(contract.mintTokens([user1], [OneToken])).eventually.fulfilled;

        const balanceAfter = await token.balanceOf(user1);

        expect(balanceAfter.sub(balanceBefore)).bignumber.equal(OneToken);
    });

    it('should fail to accept funds after ICO end and before finalize', async () => {
        await expect(contract.sendTransaction({
            from: user1,
            value: OneEther,
            gas: 300000
        })).eventually.rejected;
    });
});
