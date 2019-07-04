const BN = web3.utils.BN;

require('chai')
  .use(require('chai-as-promised'))
  .use(require('chai-bn')(BN))
  .should();

const { sign, hashAndSign } = require('./utils.js');

const OneToken = new BN(web3.utils.toWei('1', 'ether'));

const NOIAToken = artifacts.require('NOIAToken');
const RandomContract = artifacts.require('RandomContract');
const TestTokenReceiver = artifacts.require("TestTokenReceiver");
const CanonicalBurner = artifacts.require("CanonicalBurner");
const TestERC20Token = artifacts.require("TestERC20Token");

contract('NOIA Token', async accounts => {
  const admin = accounts[0];
  const user1 = accounts[1];
  const user2 = accounts[2];
  let token;

  beforeEach(async () => {
    token = await NOIAToken.new();
  });

  describe('Default', () => {
    it('receives token name', async () => {
      (await token.name()).should.equal('NOIA Token');
    });
    it('receives token symbol', async () => {
      (await token.symbol()).should.equal('NOIA');
    });
    it('receives decimals', async () => {
      (await token.decimals()).should.bignumber.equal('18');
    });
    it('token is created with tokensToMint = 1000000000', async () => {
      (await token.tokensToMint()).should.bignumber.equal(web3.utils.toWei('1000000000'));
    });
    it('should successfully set burn address', async () => {
      await token.setBurnAddress(user2);

      (await token.burnAddress()).should.equal(user2);
    });
    it('stranger should fail to set burn address', async () => {
      await token.setBurnAddress(user2, { from : user1 }).should.be.rejected;
    });
    it('should fail to set burnAddress when it has non zero balance', async () => {
      await token.mint(user2, OneToken);

      await token.setBurnAddress(user2).should.be.rejected;
    });
  });

  describe('Minting', () => {
    it('allows owner to mint tokens', async () => {
      await token.mint(user2, OneToken);

      (await token.balanceOf(user2)).should.be.bignumber.equal(OneToken);
    });

    it('should transfer while minting is enabled', async () => {
      await token.mint(user1, OneToken);

      await token.transfer(user2, OneToken, {
        from: user1
      });

      (await token.balanceOf(user2)).should.be.bignumber.equal(OneToken);
    });

    it('stranger cannot mint tokens', async () => {
      await token.mint(user2, OneToken, {
        from: user2
      }).should.be.rejected;
    });

    it('cannot mint to address(0)', async () => {
      await token.mint('0x0', OneToken).should.be.rejected;
    });

    it('allows minting only 1 000 000 000 tokens', async () => {
      await token.mint(user2, OneToken.mul(new BN('1000000000')));

      await token.mint(user2, '1').should.be.rejected;
    });

    it('allows minting not more than 1 000 000 000 tokens', async () => {
      await token.mint(user2, OneToken.mul(new BN('1000000000')).add(new BN('1'))).should.be.rejected;
    });

    it('mints and burns when minting tokens to burn address', async () => {      
      await token.mint(user1, OneToken.mul(new BN('999999999')));
      await token.setBurnAddress(user2);

      await token.mint(user2, OneToken);

      (await token.balanceOf(user2)).should.bignumber.equal('0');
    });

    it('mints and notifies smart contract', async () => {
      const receiver = await TestTokenReceiver.new(token.address);

      await token.mint(receiver.address, OneToken);

      (await token.balanceOf(receiver.address)).should.bignumber.equal(OneToken);
      (await receiver.from()).should.equal('0x0000000000000000000000000000000000000000');
      (await receiver.to()).should.equal(receiver.address);
      (await receiver.amount()).should.bignumber.equal(OneToken);
    });

    it('mints and burns when minting to burner contract', async () => {
      const receiver = await CanonicalBurner.new(token.address);
      await token.mint(user1, OneToken.mul(new BN('999999999')));
      await token.setBurnAddress(receiver.address);

      await token.mint(receiver.address, OneToken);

      (await token.balanceOf(receiver.address)).should.bignumber.equal('0');
    });
  });

  describe('Transfer', () => {
    let receiver;
    beforeEach(async () => {
      await token.mint(admin, OneToken.mul(new BN(10)));
      random = await RandomContract.new();
      receiver = await TestTokenReceiver.new(token.address);
    });

    it('should success ERC20 transfer', async () => {
      await token.transfer(user1, OneToken);

      (await token.balanceOf(user1)).should.be.bignumber.equal(OneToken);
    });

    it('should successfully transfer and notify token receiver smart contract', async () => {
      await token.transfer(receiver.address, OneToken);

      (await token.balanceOf(receiver.address)).should.be.bignumber.equal(OneToken);
      (await receiver.from()).should.equal(admin);
      (await receiver.to()).should.equal(receiver.address);
      (await receiver.amount()).should.bignumber.equal(OneToken);
    });

    it('should successfully transfer into unregistered smart contract ', async () => {
      await receiver.unregister();

      await token.transfer(receiver.address, OneToken);

      (await token.balanceOf(receiver.address)).should.be.bignumber.equal(OneToken);
      (await receiver.from()).should.equal('0x0000000000000000000000000000000000000000');
      (await receiver.to()).should.equal('0x0000000000000000000000000000000000000000');
      (await receiver.amount()).should.bignumber.equal(new BN('0'));
    });
  });
  
  describe('Etherless Transfer', () => {
    let receiver;
    let methodSignature;
    beforeEach(async () => {
      await token.mint(admin, OneToken.mul(new BN(10)));
      random = await RandomContract.new();
      receiver = await TestTokenReceiver.new(token.address);
      methodSignature = web3.eth.abi.encodeFunctionSignature("transferPreSigned(bytes,address,uint256,uint256,uint256)");
    });

    it('should success ERC20 transfer', async () => {
      const msg = await token.hashForSign(methodSignature, token.address, user1, OneToken, OneToken, 1);
      const signature = await sign(msg, admin);

      await token.transferPreSigned(signature, user1, OneToken, OneToken, 1);

      (await token.balanceOf(user1)).should.be.bignumber.equal(OneToken);
    });

    it('should success ERC20 transfer from receiver', async () => {
      const msg = await token.hashForSign(methodSignature, token.address, user1, OneToken, OneToken, 1);
      const signature = await sign(msg, admin);

      await token.transferPreSigned(signature, user1, OneToken, OneToken, 1, { from: user1 });

      (await token.balanceOf(user1)).should.be.bignumber.equal(OneToken.mul(new BN('2')));
    });

    it('should successfully transfer and notify token receiver smart contract', async () => {
      const msg = await token.hashForSign(methodSignature, token.address, receiver.address, OneToken, OneToken, 1);
      const signature = await sign(msg, admin);

      await token.transferPreSigned(signature, receiver.address, OneToken, OneToken, 1);

      (await token.balanceOf(receiver.address)).should.be.bignumber.equal(OneToken);
      (await receiver.from()).should.equal(admin);
      (await receiver.to()).should.equal(receiver.address);
      (await receiver.amount()).should.bignumber.equal(OneToken);
    });

    it('should successfully forward transfer and notify token receiver smart contract', async () => {
      const msg = await token.hashForSign(methodSignature, token.address, user1, OneToken, OneToken, 1);
      const signature = await sign(msg, admin);

      await receiver.forwardTransferPreSigned(signature, user1, OneToken, OneToken, 1);

      (await token.balanceOf(user1)).should.be.bignumber.equal(OneToken);
      (await token.balanceOf(receiver.address)).should.be.bignumber.equal(OneToken);
      (await receiver.from()).should.equal(admin);
      (await receiver.to()).should.equal(receiver.address);
      (await receiver.amount()).should.bignumber.equal(OneToken);
    });

    it('should successfully forward transfer and notify token receiver smart contract', async () => {
      const msg = await token.hashForSign(methodSignature, token.address, receiver.address, OneToken, OneToken, 1);
      const signature = await sign(msg, admin);

      await receiver.forwardTransferPreSigned(signature, receiver.address, OneToken, OneToken, 1);

      (await token.balanceOf(receiver.address)).should.be.bignumber.equal(OneToken.mul(new BN('2')));
      (await receiver.from()).should.equal(admin);
      (await receiver.to()).should.equal(receiver.address);
      (await receiver.amount()).should.bignumber.equal(OneToken.mul(new BN('2')));
    });

    it('should successfully transfer into unregistered smart contract ', async () => {
      const msg = await token.hashForSign(methodSignature, token.address, receiver.address, OneToken, OneToken, 1);
      const signature = await sign(msg, admin);
      await receiver.unregister();

      await token.transferPreSigned(signature, receiver.address, OneToken, OneToken, 1);

      (await token.balanceOf(receiver.address)).should.be.bignumber.equal(OneToken);
      (await receiver.from()).should.equal('0x0000000000000000000000000000000000000000');
      (await receiver.to()).should.equal('0x0000000000000000000000000000000000000000');
      (await receiver.amount()).should.bignumber.equal(new BN('0'));
    });


  });

  describe('Burning', () => {
    let burner;
    let receiver;
    let methodSignature;
    beforeEach(async () => {
      await token.mint(admin, OneToken.mul(new BN(10)));
      burner = await CanonicalBurner.new(token.address);
      receiver = await TestTokenReceiver.new(token.address);
      methodSignature = web3.eth.abi.encodeFunctionSignature("transferPreSigned(bytes,address,uint256,uint256,uint256)");
    });

    it('should not allow burning before all tokens are minted', async () => {
      await token.setBurnAddress(user1);

      await token.transfer(user1, OneToken).should.be.rejected;
    });

    describe('when all tokens minted', () => {
      beforeEach(async () => {
        const tokensLeft = await token.tokensToMint();
        await token.mint(admin, tokensLeft);
      });

      it('should burn tokens when transfering to burnAddress', async () => {
        const balance = await token.balanceOf(admin);
        await token.setBurnAddress(user1);
  
        await token.transfer(user1, OneToken);
  
        (await token.balanceOf(user1)).should.bignumber.equal(new BN(0));
        (await token.balanceOf(admin)).should.bignumber.equal(new BN(balance).sub(OneToken));
      });
  
      it('should burn tokens using burning contract', async () => {
        const balance = await token.balanceOf(admin);
        await token.setBurnAddress(burner.address);
  
        await token.transfer(burner.address, OneToken);
  
        (await token.balanceOf(burner.address)).should.bignumber.equal(new BN(0));
        (await token.balanceOf(admin)).should.bignumber.equal(new BN(balance).sub(OneToken));
      });
  
      it('unregistered burner should have balance', async () => {
        await receiver.unregister();
        await token.setBurnAddress(receiver.address);
  
        await token.transfer(receiver.address, OneToken);
  
        (await token.balanceOf(receiver.address)).should.bignumber.equal(OneToken);
      });

      it('should burn tokens when etherless transfer to burn address', async () => {
        const msg = await token.hashForSign(methodSignature, token.address, user1, OneToken, OneToken, 1);
        const signature = await sign(msg, admin);
        await token.setBurnAddress(user1);
  
        await token.transferPreSigned(signature, user1, OneToken, OneToken, 1);    
  
        (await token.balanceOf(user1)).should.be.bignumber.equal('0');
      });

      it('should etherless burn tokens using burning contract', async () => {
        const msg = await token.hashForSign(methodSignature, token.address, burner.address, OneToken, OneToken, 1);
        const signature = await sign(msg, admin);
        const balance = await token.balanceOf(admin);
        await token.setBurnAddress(burner.address);
  
        await token.transferPreSigned(signature, burner.address, OneToken, OneToken, 1);    
  
        (await token.balanceOf(burner.address)).should.bignumber.equal('0');
        (await token.balanceOf(admin)).should.bignumber.equal(new BN(balance).sub(OneToken));
      });
  
      it('stranger cannot burn tokens', async () => {
        await token.transfer(user2, OneToken);
        await token.setBurnAddress(user1);
  
        await token.burn(OneToken, { from: user2 }).should.be.rejected;
      });
    });
  });

  describe('Token Recovery', () => {
    let erc20Token;

    beforeEach(async () => {
      erc20Token = await TestERC20Token.new();

      await erc20Token.mint(user1, OneToken);
      await erc20Token.transfer(token.address, OneToken, {
        from: user1
      });
    });

    it('owner can recover other tokens', async () => {
      await token.recoverTokens(erc20Token.address, user1, OneToken);

      (await erc20Token.balanceOf(token.address)).should.be.bignumber.equal('0');
      (await erc20Token.balanceOf(user1)).should.be.bignumber.equal(OneToken);
    });

    it('stranger cannot recover other tokens', async () => {
      await token.recoverTokens(erc20Token.address, user1, OneToken, {
        from: user1
      }).should.be.rejected;
    });
  });
});
