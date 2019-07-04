const leftpad = require('left-pad');
const util = require('ethjs-util');

function formattedInt(value) {
    return leftpad((value).toString(16), 64, 0);
}

function formattedAddress(address) {
    return address.slice(2);
}

async function hashAndSign(signer, to, value, fee, nonce, tokenAddress) {
    const hexData = [
        '1296830d',
        formattedAddress(tokenAddress),
        formattedAddress(to),
        formattedInt(value),
        formattedInt(fee),
        formattedInt(nonce)
    ].join('');
    const msg = web3.utils.soliditySha3(`0x${hexData}`);
    return sign(msg, signer);
}

async function sign(msg, signer) {
    return fixSignature(await web3.eth.sign(msg, signer));
}

// taken from https://raw.githubusercontent.com/tbocek/openzeppelin-solidity/93993ceadef0ebe2d88b5620eaa889deb10fae84/test/helpers/sign.js
function fixSignature (signature) {
    // in geth its always 27/28, in ganache its 0/1. Change to 27/28 to prevent
    // signature malleability if version is 0/1
    // see https://github.com/ethereum/go-ethereum/blob/v1.8.23/internal/ethapi/api.go#L465
    let v = parseInt(signature.slice(130, 132), 16);
    if (v < 27) {
        v += 27;
    }
    const vHex = v.toString(16);
    return signature.slice(0, 130) + vHex;
}

module.exports.sign = sign;
module.exports.hashAndSign = hashAndSign;
