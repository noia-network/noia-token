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

contract('NOIACrowdsale Good ICO', async accounts => {
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
        await contract.setNow(start.add(1));
    });

    it('should pass from stage 0 to stage 2', async () => {
        await contract.sendTransaction({
            from: user1,
            value: OneEther.mul(12500),
            gas: 200000
        });

        expect(await contract.currentStage()).bignumber.equal(2);
    });

    it('have 12500 Ether on balance', async () => {
        const walletBalanceAfter = new BigNumber(await web3.eth.getBalance(await contract.WALLET()));

        expect(walletBalanceAfter.sub(walletBalance)).bignumber.equal(OneEther.mul(12500));
    });

    it('should mint pre sale tokens', async () => {
        await contract.mintPreSaleTokens([user1], [await contract.PRE_SALE_TOKENS()]);
    });

    it('should mint and send ether until token cap', async () => {
        await contract.mintTokens([user1], [OneToken.mul(200000000)]);

        await contract.sendTransaction({
            from: user1,
            value: OneEther.mul(30000),
            gas: 300000
        });

        const totalSupply = await token.totalSupply();
        expect(await contract.ICO_TOKENS()).bignumber.equal(totalSupply);
    });

    it('should successfully finalize successfull ICO before end', async () => {
        await contract.setNow(end.sub(1));
        await expect(contract.finalize()).eventually.fulfilled;
    });

    it('total supply should be 1 000 000 000 tokens', async () => {
        expect(await token.totalSupply()).bignumber.equal(OneToken.mul(1000000000));
    });

    it('should reject tx after finalize()', async () => {
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
            icoPercent,
            teamPercent,
            advisorsPercent,
            communityPercent,
            futurePercent,
            advisorsWallet,
            communityWallet,
            teamTimelock,
            futureTimelock
        ] =
        await Promise.all([
            token.balanceOf(user1),
            contract.ICO_PERCENT(),
            contract.TEAM_PERCENT(),
            contract.ADVISORS_PERCENT(),
            contract.COMMUNITY_PERCENT(),
            contract.FUTURE_PERCENT(),
            contract.ADVISORS_WALLET(),
            contract.COMMUNITY_WALLET(),
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

    it('succeeds to transfer tokens after ICO end', async () => {
        const balanceBefore = await token.balanceOf(accounts[2]);
        await expect(token.transfer(accounts[2], OneToken, {
            from: user1
        })).eventually.fulfilled;
        const balanceAfter = await token.balanceOf(accounts[2]);
        expect(balanceAfter.sub(balanceBefore)).bignumber.equal(OneToken);
    });
});