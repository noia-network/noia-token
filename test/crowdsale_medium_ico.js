const BigNumber = web3.BigNumber;

const chai = require('chai');
chai.use(require('chai-as-promised'));
chai.use(require('chai-bignumber')(BigNumber));

const expect = chai.expect;

const OneEther = new BigNumber(web3.toWei(1, 'ether'));
const OneUSD = new BigNumber(web3.toWei(1, 'ether'));

const NOIACrowdsale = artifacts.require('TestNOIACrowdsale');
const NOIAToken = artifacts.require('NOIAToken');
const Whitelist = artifacts.require('Whitelist');

contract('NOIACrowdsale Medium ICO', async accounts => {
    const user1 = accounts[1];
    let contract;
    let token;
    let whitelist;
    let tokenPriceNominator;
    let tokenPriceDenominator;
    let start;
    let end;
    let usdExchangeRate;
    let walletBalance;

    function ethToTokens(wei, discount) {
        const usd = wei.mul(usdExchangeRate).div(1000);
        return usd.mul(tokenPriceDenominator.mul(100)).div(new BigNumber(100 - discount).mul(tokenPriceNominator));
    }

    before(async () => {
        [token, whitelist] = await Promise.all([NOIAToken.new(), Whitelist.new()]);
        contract = await NOIACrowdsale.new(token.address, whitelist.address);
        await token.transferOwnership(contract.address);
        await contract.setNow(0);
        [start, end, tokenPriceNominator, tokenPriceDenominator, usdExchangeRate] = await Promise.all([contract.START_TIME(), contract.END_TIME(), contract.TOKEN_PRICE_NOMINATOR(), contract.TOKEN_PRICE_DENOMINATOR(), contract.exchangeRate()]);
        walletBalance = await web3.eth.getBalance(await contract.WALLET());
        await whitelist.addAddress(user1);
        await contract.setMaxPurchaseUsd(OneUSD.mul(100000000));
    });

    it('should not accept funds before ICO start', async () => {
        await expect(contract.sendTransaction({
            from: user1,
            value: OneEther
        })).rejected;
    });

    it('should accept funds after startTime', async () => {
        await contract.setNow(start.add(1));

        await contract.sendTransaction({
            from: user1,
            value: OneEther,
            gas: 200000
        });
        const discount = await contract.getStageDiscount(0);

        expect(await token.balanceOf(user1)).bignumber.equal(ethToTokens(OneEther, discount).round());
    });

    it('should correctly pass from stage 0 to stage 1', async () => {
        const [balanceBefore, discount] = await Promise.all([
            token.balanceOf(user1),
            contract.getStageDiscount(0)
        ]);

        await contract.sendTransaction({
            from: user1,
            value: OneEther.mul(7500),
            gas: 200000
        })

        expect(await contract.currentStage()).bignumber.equal(1);

        const balanceAfter = await token.balanceOf(user1);
        expect(balanceAfter.sub(balanceBefore)).bignumber.equal(ethToTokens(OneEther.mul(7500), discount).floor());
    });

    it('should correctly pass from stage 1 to stage 4', async () => {
        await contract.sendTransaction({
            from: user1,
            value: OneEther.mul(12500),
            gas: 200000
        });

        expect(await contract.currentStage()).bignumber.equal(4);
    });

    it('should have 20001 Ether on balance', async () => {
        const walletBalanceAfter = new BigNumber(await web3.eth.getBalance(await contract.WALLET()));
        expect(walletBalanceAfter.sub(walletBalance)).bignumber.equal(OneEther.mul(20001));
    });

    it('should mint pre sale tokens', async () => {
        await contract.mintPreSaleTokens([user1], [await contract.PRE_SALE_TOKENS()]);
    });

    it('should not be able to Finalize ICO before end time', async () => {
        await expect(contract.finalize()).eventually.rejected;
    });

    it('should successfully finalize successfull ICO', async () => {
        await contract.setNow(end.add(1));
        await expect(contract.finalize()).eventually.fulfilled;

        const walletBalanceAfter = new BigNumber(await web3.eth.getBalance(await contract.WALLET()));
        expect(web3.fromWei(walletBalanceAfter.sub(walletBalance)).toNumber()).closeTo(20001, 0.01);
    });

    it('should not be possible to get refund', async () => {
        await expect(contract.sendTransaction({
            from: user1,
            value: 0
        })).eventually.rejected;
    });

    it('should change token owner to token', async () => {
        expect(await token.owner()).equal(await contract.owner());
    });

    it('should finish minting', async () => {
        expect(await token.state()).bignumber.equal(1); // Trading
    });

    it('should correctly mint tokens on finalize', async () => {
        const [
            soldTokens,
            icoTokens,
            totalSupply,
            icoPercent,
            teamPercent,
            advisorsPercent,
            communityPercent,
            futurePercent,
            teamWallet,
            advisorsWallet,
            communityWallet,
            futureWallet,
            teamTimelock,
            futureTimelock
        ] =
        await Promise.all([
            token.balanceOf(user1),
            contract.ICO_TOKENS(),
            token.totalSupply(),
            contract.ICO_PERCENT(),
            contract.TEAM_PERCENT(),
            contract.ADVISORS_PERCENT(),
            contract.COMMUNITY_PERCENT(),
            contract.FUTURE_PERCENT(),
            contract.TEAM_WALLET(),
            contract.ADVISORS_WALLET(),
            contract.COMMUNITY_WALLET(),
            contract.FUTURE_WALLET(),
            contract.teamTimelock(),
            contract.futureTimelock()
        ]);

        const [teamTimelockBalance, futureTimelockBalance, advisorsBalance, communityBalance] = await Promise.all([
            token.balanceOf(teamTimelock),
            token.balanceOf(futureTimelock),
            token.balanceOf(advisorsWallet),
            token.balanceOf(communityWallet)
        ]);

        const expectedTeamTokens = soldTokens.mul(teamPercent).div(icoPercent).floor();
        const expectedFutureTokens = soldTokens.mul(futurePercent).div(icoPercent).floor();

        expect(teamTimelockBalance).bignumber.equal(expectedTeamTokens);
        expect(futureTimelockBalance).bignumber.equal(expectedFutureTokens);

        const expectedAdvisorsTokens = soldTokens.mul(advisorsPercent).div(icoPercent).floor();
        expect(advisorsBalance).bignumber.equal(expectedAdvisorsTokens);
        const expectedCommunityTokens = soldTokens.mul(communityPercent).div(icoPercent).floor();
        expect(communityBalance).bignumber.equal(expectedCommunityTokens);
    });
});