const BigNumber = web3.BigNumber;

require('chai')
  .use(require('chai-as-promised'))
  .use(require('chai-bignumber')(BigNumber))
  .should();

const OneToken = new BigNumber(web3.toWei(1, 'ether'));

const NOIAToken = artifacts.require('NOIAToken');
const REVOKE_OPERATOR = 0;
const AUTHORIZE_OPERATOR = 1;

contract('NOIA Token', async accounts => {
  const admin = accounts[0];
  const user1 = accounts[1];
  const user2 = accounts[2];
  let token;

  function signAuthorization(signer, operator, nonce, authorize) {
    const leftpad = require('left-pad');

    const hexData = [
      token.address.slice(2),
      operator.slice(2),
      leftpad((nonce).toString(16), 64, 0),
      leftpad((authorize).toString(16), 2, 0)
    ].join('');

    const msg = web3.sha3(hexData, {
      encoding: 'hex'
    });

    return new Promise((resolve, reject) => {
      web3.eth.sign(signer, msg, (error, result) => {
        if (error) {
          return reject(error);
        }
        console.log(`Sign result: ${result}`);
        return resolve(result);
      });
    });
  }

  before(async () => {
    token = await NOIAToken.new();
  });

  it('token is created in Minting state', async () => {
    (await token.state()).should.be.bignumber.equal(0);
  });

  it('should mint tokens', async () => {
    await token.mint(admin, OneToken);
    (await token.balanceOf(admin)).should.be.bignumber.equal(OneToken);
  });

  it('should fail to transfer while minting', async () => {
    return token.transfer(user1, OneToken).should.be.rejected;
  });

  it('should fail to switch on burning before finished minting', async () => {
    return token.enableBurn(true).should.be.rejected;
  });

  it('should successfully finish minting', async () => {
    await token.finishMinting();

    (await token.state()).should.be.bignumber.equal(1);
  });

  it('should fail to finish minting again', async () => {
    return token.finishMinting().should.be.rejected;
  });

  it('should success transfer after minting finished', async () => {
    await token.transfer(user1, OneToken);

    (await token.balanceOf(user1)).should.be.bignumber.equal(OneToken);
  });

  it('should fail to burn before burning is enabled', async () => {
    return token.burn(OneToken.mul(0.5), ', ', { from: user1 }).should.be.rejected;
  });

  it('should success enable burning', async () => {
    await token.enableBurn(true);

    (await token.state()).should.be.bignumber.equal(2);
  });

  it('should successfully burn', async () => {
    const totalSupply = await token.totalSupply();

    await token.burn(OneToken.mul(0.5), '', '', { from: user1 });

    (await token.balanceOf(user1)).should.be.bignumber.equal(OneToken.mul(0.5));
    (await token.totalSupply()).should.be.bignumber.equal(totalSupply.sub(OneToken.mul(0.5)));
  });

  it('should successfully disable burning', async () => {
    await token.enableBurn(false);

    (await token.state()).should.be.bignumber.equal(1);
  });

  it('should fail to burn after burning is disabled', async () => {
    return token.burn(OneToken.mul(0.5), ', ', { from: user1 }).should.be.rejected;
  });

  it('should be possible to authorize operator with signature', async () => {
    const signer = user1;
    const operator = user2;
    const nonce = 0;
    const signature = await signAuthorization(signer, operator, nonce, AUTHORIZE_OPERATOR);

    (await token.isOperatorFor(operator, signer)).should.be.false;

    await token.authorizeOperatorWithSignature(operator, nonce, signature, {
      from: user2
    });

    (await token.isOperatorFor(operator, signer)).should.be.true;
  });

  it('should be possible to revoke operator with signature', async () => {
    const signer = user1;
    const operator = user2;
    const nonce = 1;
    const signature = await signAuthorization(signer, operator, nonce, REVOKE_OPERATOR);

    (await token.isOperatorFor(operator, signer)).should.be.true;

    await token.revokeOperatorWithSignature(operator, nonce, signature, {
      from: user2
    });

    (await token.isOperatorFor(operator, signer)).should.be.false;
  });

  it('should not be possible to authorize operator with revoke signature', async () => {
    const signer = user1;
    const operator = user2;
    const nonce = 2;
    const signature = await signAuthorization(signer, operator, nonce, REVOKE_OPERATOR);

    return token.authorizeOperatorWithSignature(operator, nonce, signature, {from: user2}).should.be.rejected;
  });

  it('should not be possible to revoke operator with authorize signature', async () => {
    const signer = user1;
    const operator = user2;
    const nonce = 2;
    // authorize operator first
    const signature = await signAuthorization(signer, operator, nonce, AUTHORIZE_OPERATOR);

    await token.authorizeOperatorWithSignature(operator, nonce, signature, {
      from: user2
    });
    (await token.isOperatorFor(operator, signer)).should.be.true;

    const revokeNonce = nonce + 1;

    const sig = await signAuthorization(signer, operator, revokeNonce, AUTHORIZE_OPERATOR);
    return token.revokeOperatorWithSignature(operator, revokeNonce, sig, { from: user2 }).should.be.rejected;
  });

  it('should not be possible to authorize operator with wrong nonce', async () => {
    const signer = user1;
    const operator = user2;
    const nonce = 999;
    const sig = await signAuthorization(signer, operator, nonce, AUTHORIZE_OPERATOR);
    return token.authorizeOperatorWithSignature(operator, nonce, sig, { from: user2 }).should.be.rejected;
  });

});
