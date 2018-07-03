const BigNumber = web3.BigNumber;

const chai = require('chai');
chai.use(require('chai-as-promised'));
chai.use(require('chai-bignumber')(BigNumber));

const expect = chai.expect;

const OneEther = new BigNumber(web3.toWei(1, 'ether'));
const OneToken = new BigNumber(web3.toWei(1, 'ether'));

const NOIAToken = artifacts.require('NOIAToken');
const Whitelist = artifacts.require('Whitelist');
const NOIACrowdsale = artifacts.require('TestNOIACrowdsale');

contract('NOIA Crowdsale', async accounts => {
    const admin = accounts[0];
    const user1 = accounts[1];
    const user2 = accounts[2];
    let token;
    let whitelist;
    let contract;
    let start;
    let end;
    let tokenPriceNominator;
    let tokenPriceDenominator;

    before(async () => {
        [token, whitelist] = await Promise.all([NOIAToken.new(), Whitelist.new()]);
        contract = await NOIACrowdsale.new(token.address, whitelist.address);
        await token.transferOwnership(contract.address);
        [start, end, tokenPriceNominator, tokenPriceDenominator] = await Promise.all([contract.START_TIME(), contract.END_TIME(), contract.TOKEN_PRICE_NOMINATOR(), contract.TOKEN_PRICE_DENOMINATOR()]);
    });

    it('should convert usd to tokens', async () => {
        const expected = new BigNumber(1000).mul(tokenPriceDenominator).div(tokenPriceNominator).floor();
        expect(await contract.usdToTokensTest(1000, 4)).bignumber.equal(expected);
    });

    it('should convert tokens to usd', async () => {
        const expected = new BigNumber(20000).mul(tokenPriceNominator).div(tokenPriceDenominator).floor();
        expect(await contract.tokensToUsdTest(20000, 4)).bignumber.equal(expected);
    });

    it('should convert usd to tokens with discount', async () => {
        const expected = new BigNumber(1000).mul(tokenPriceDenominator).div(100 - 20).mul(100).div(tokenPriceNominator).floor();
    });

    it('should convert usd to tokens with discount', async () => {
        const expected = new BigNumber(20000).mul(tokenPriceNominator).mul(100 - 20).div(100).div(tokenPriceDenominator).floor();
        expect(await contract.tokensToUsdTest(20000, 0)).bignumber.equal(expected);
    });

    it('sum of all percents is 100', async () => {
        const percents = await Promise.all([
            contract.ICO_PERCENT(),
            contract.TEAM_PERCENT(),
            contract.ADVISORS_PERCENT(),
            contract.COMMUNITY_PERCENT(),
            contract.FUTURE_PERCENT()
        ]);

        expect(percents.reduce((x, y) => x.add(y))).bignumber.equal(100);
    });

    it('set crowdsale contract as NOIAToken owner', async () => {
        expect(await token.owner()).equal(contract.address);
    });

    it('ICO period should be 31 days', async () => {
        const icoPeriodInSecs = (60 * 60 * 24 * 31);
        const period = (end - start);

        expect(period).equal(icoPeriodInSecs);
    });

    it('starts from zero stage', async () => {
        expect(await contract.currentStage()).bignumber.equal(0);
    });

    it('owner should be able to mint tokens', async () => {
        await contract.mintTokens([user1], [OneToken]);
        expect(await token.balanceOf(user1)).bignumber.equal(OneToken);
    });

    it('fails to manually mint to 0x0 address', async () => {
        await expect(contract.mintTokens([0], [OneToken])).eventually.rejected;
    });

    it('fails to manually mint 0 amount', async () => {
        await expect(contract.mintTokens([user1], [0])).eventually.rejected;
    });

    it('sets token minter', async () => {
        await contract.setTokenMinter(user1);
    });

    it('fails to set 0x0 address as token minter', async () => {
        await expect(contract.setTokenMinter(0)).eventually.rejected;
    });

    it('fails to manually mint from other account', async () => {
        await expect(contract.mintTokens([user2], [OneToken], {
            from: user2
        })).eventually.rejected;
    });

    it('token minter can manually mint', async () => {
        await contract.mintTokens([user2], [OneToken], {
            from: user1
        });

        expect(await token.balanceOf(user2)).bignumber.equal(OneToken);
    });

    it('owner can manually mint after token minter is set', async () => {
        await contract.mintTokens([user2], [OneToken], {
            from: admin
        });

        expect(await token.balanceOf(user2)).bignumber.equal(OneToken.mul(2));
    });

    it('fails to transfer tokens before ICO end', async () => {
        await expect(token.transfer(user1, OneToken, {
            from: user2
        })).eventually.rejected;
    });

    it('mints to many addresses', async () => {
        await contract.mintTokens([user1, user2], [OneToken, OneToken], {
            from: user1
        });

        expect(await token.balanceOf(user1)).bignumber.equal(OneToken.mul(2));
        expect(await token.balanceOf(user2)).bignumber.equal(OneToken.mul(3));
    });

    it('fails to mint to many addresses when array size unequal 1', async () => {
        await expect(contract.mintTokens([user1], [OneToken, OneToken], {
            from: user1
        })).eventually.rejected;
    });

    it('fails to mint to many addresses when array sizes are unequal', async () => {
        await expect(contract.mintTokens([user1, user2], [OneToken], {
            from: user1
        })).eventually.rejected;
    });

    it('fails to mint to many addresses when array is empty', async () => {
        await expect(contract.mintTokens([], [], {
            from: user1
        })).eventually.rejected;
    });

    it('fails to mint to many addresses when array have > 100 elements', async () => {
        let receivers = [];
        let amounts = [];
        for (let i = 0; i < 101; i++) {
            receivers.push(admin);
            amounts.push(OneToken);
        }
        await expect(contract.mintTokens(receivers, amounts, {
            from: user1
        })).eventually.rejected;
    });

    it('fails to mint pre sale token that actually have', async () => {
        const preSaleTokens = await contract.PRE_SALE_TOKENS();
        expect(preSaleTokens).bignumber.above(0);
        await expect(contract.mintPreSaleTokens([user1, user2], [preSaleTokens, preSaleTokens])).rejected;
    });

    it('mints pre sale tokens', async () => {
        const balance = await token.balanceOf(user1);
        const preSaleTokens = await contract.preSaleTokensLeft();
        expect(preSaleTokens).bignumber.above(0);
        await contract.mintPreSaleTokens([user1], [preSaleTokens]);
        expect(await contract.preSaleTokensLeft()).bignumber.equal(0);

        expect(await token.balanceOf(user1)).bignumber.equal(balance.add(preSaleTokens));
    });

    it('fails to mint more pre sale tokens', async () => {
        await expect(contract.mintPreSaleTokens([user1], [OneToken])).rejected;
    });

    it('manually mints all left tokens', async () => {
        const tx = await contract.mintTokens([user1], [OneToken.mul(10000000000)]);

        expect(await token.totalSupply()).bignumber.equal(await contract.ICO_TOKENS());

        expect(tx.logs[0].event).equal('ManualTokenMintRequiresRefund');
    });

    it('unknown user should fail to set ETH rate', async () => {
        await (contract.setExchangeRate(100, {
            from: user2
        })).should.be.rejected;
    });

    it('unknown user should not set rate orcale', async () => {
        await contract.setExchangeRateOracle(user2, {
            from: user1
        }).should.be.rejected;
    });

    it('known account should set ETH rate', async () => {
        await contract.setExchangeRateOracle(user2);
        await contract.setExchangeRate(100, {
            from: user2
        });
        (await contract.exchangeRate()).should.be.bignumber.equal(100);
    });

    it('owner should set ETH rate', async () => {
        await contract.setExchangeRate(200);
        (await contract.exchangeRate()).should.be.bignumber.equal(200);
    });
});