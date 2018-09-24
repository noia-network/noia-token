const BigNumber = web3.BigNumber;

const leftpad = require('left-pad');
const rightpad = require('right-pad');

require('chai')
  .use(require('chai-as-promised'))
  .use(require('chai-bignumber')(BigNumber))
  .should();

const OneToken = new BigNumber(web3.toWei(1, 'ether'));

const NOIAToken = artifacts.require('NOIAToken');
const ChannelOperator = artifacts.require('ChannelOperator');

contract('ChannelOperator', async accounts => {
  const admin = accounts[0];
  const user1 = accounts[1];
  const user2 = accounts[2];
  let token;
  let channelOperator;
  const channelId = 1;

  function sign(signer, channelId, value) {
    const hexData = [
      channelOperator.address.slice(2),
      rightpad((channelId).toString(16), 64, 0),
      leftpad((value).toString(16), 64, 0)
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

  before(async () => {
    token = await NOIAToken.new();
    channelOperator = await ChannelOperator.new(token.address);
    await token.mint(admin, OneToken.mul(100));
    await token.finishMinting();
  });
  
  it('should open channel', async () => {
    await channelOperator.openChannel(channelId, user1, admin, "some data");

    const channel = await channelOperator.getChannel(channelId);
    channel[0].should.be.equal(user1); // beneficiary
    channel[1].should.be.equal(admin); // payer
    channel[3].should.be.bignumber.equal(0); // totalSum
  });

  it('should fail to open channel with same id', async () => {
    await channelOperator.openChannel(channelId, user1, admin, "some data").should.be.rejected;
  });

  it('user1 should have zero balance', async () => {
    (await token.balanceOf(user1)).should.be.bignumber.equal(0);
  });

  it('should successfully set channel contract as operator', async () => {
    await token.authorizeOperator(channelOperator.address, {
      from: admin
    });

    (await token.isOperatorFor(channelOperator.address, admin)).should.be.true;
  });

  it('should be possible to withdraw single sendToChannel', async () => {
    const signature = await sign(admin, channelId, OneToken);

    await channelOperator.sendToChannel(channelId, OneToken, signature, {
      from: user1
    });

    (await token.balanceOf(user1)).should.be.bignumber.equal(OneToken);
  });

  it('should be possible to withdraw multiple signatures in one tx', async () => {
    const signatures = [];
    for (let i = 0; i < 5; i++) {
      signatures.push(await sign(admin, channelId, OneToken.mul(i + 2)));
    }
    const latest = signatures[signatures.length - 1];

    await channelOperator.sendToChannel(channelId, OneToken.mul(6), latest, {
      from: user1
    });

    (await token.balanceOf(user1)).should.be.bignumber.equal(OneToken.mul(6));
  });

  it('should send one token to user2', async () => {
    await token.transfer(user2, OneToken, { from: admin });
    (await token.balanceOf(user2)).should.be.bignumber.equal(OneToken);
  });

  it('should be possible to withdraw funds with one signature several times', async () => {
    const user1Balance = await token.balanceOf(user1);

    await token.authorizeOperator(channelOperator.address, {
      from: user2
    });
    const anotherChannelId = 2;
    await channelOperator.openChannel(anotherChannelId, user1, user2, '');
    const signature = await sign(user2, anotherChannelId, OneToken.mul(2));
    await channelOperator.sendToChannel(anotherChannelId, OneToken.mul(2), signature);

    (await token.balanceOf(user2)).should.be.bignumber.equal(0);
    (await token.balanceOf(user1)).should.be.bignumber.equal(user1Balance.add(OneToken));

    await token.transfer(user2, OneToken);
    (await token.balanceOf(user2)).should.be.bignumber.equal(OneToken);

    await channelOperator.sendToChannel(anotherChannelId, OneToken.mul(2), signature);

    (await token.balanceOf(user2)).should.be.bignumber.equal(0);
    (await token.balanceOf(user1)).should.be.bignumber.equal(user1Balance.add(OneToken.mul(2)));

    await channelOperator.sendToChannel(anotherChannelId, OneToken.mul(2), signature).should.be.rejected;
  });

  it('should not be possible to withdraw with wrong user', async () => {
    const balance = await token.balanceOf(user1);
    const signature = await sign(admin, user2, OneToken);
    await channelOperator.sendToChannel(user1, OneToken, signature, {
      from: user1
    }).should.be.rejected;
    (await token.balanceOf(user1)).should.be.bignumber.equal(balance)
  });

  it('should not be possible to withdraw with wrong value', async () => {
    const balance = await token.balanceOf(user2);
    const signature = await sign(admin, user2, OneToken);
    await channelOperator.sendToChannel(user2, OneToken.mul(2), signature, {
      from: user2
    }).should.be.rejected;
    (await token.balanceOf(user2)).should.be.bignumber.equal(balance)
  });

  it('should not be possible to withdraw with wrong signature', async () => {
    const balance = await token.balanceOf(user1);
    const signature = 0;
    await channelOperator.sendToChannel(user2, OneToken, signature, {
      from: user1
    }).should.be.rejected;
    (await token.balanceOf(user1)).should.be.bignumber.equal(balance)
  });
});

