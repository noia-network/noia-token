pragma solidity 0.4.24;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import { ERC820Implementer } from "./eip820/contracts/ERC820Implementer.sol";
import { ERC777Token } from "./erc777/contracts/ERC777Token.sol";
import "./TokenRecoverable.sol";
import "./ECRecovery.sol";


contract ChannelOperator is ERC820Implementer, TokenRecoverable {
    using SafeMath for uint256;
    using ECRecovery for bytes32;

    struct Channel {
        uint256 totalSent;
        address beneficiary;
        address payer;
        bytes data;
    }

    ERC777Token public token;
    mapping(bytes32 => Channel) public channels;

    constructor(address _token) public {
        address tokenAddress = interfaceAddr(_token, "ERC777Token");
        require(tokenAddress != address(0));
        token = ERC777Token(tokenAddress);
    }

    function openChannel(bytes32 _id, address _beneficiary, address _payer, bytes _data) public {
        require(_id != 0x0);
        require(_beneficiary != address(0));
        require(_payer != address(0));
        require(_beneficiary != _payer);
        require(channels[_id].beneficiary == address(0));
        channels[_id] = Channel({
            beneficiary: _beneficiary,
            payer: _payer,
            data: _data,
            totalSent: 0
        });
    }

    function sendToChannel(bytes32 _channelId, uint256 _value, bytes _sig) public returns (bool) {
        Channel storage channel = channels[_channelId];
        require(channel.beneficiary != address(0), "Channel does not exists");
        address signer = keccak256(abi.encodePacked(address(this), _channelId, _value))
            .toEthSignedMessageHash()
            .recover(_sig); // same security considerations as in Ethereum TX
        require(signer == channel.payer, "Invalid signer");

        uint256 amount = _value.sub(channel.totalSent);
        require(amount > 0, "Already paid");

        uint256 balance = token.balanceOf(signer);

        if (amount > balance) {
            amount = balance;
        }

        // Increase already paid amount
        channel.totalSent = channel.totalSent.add(amount);

        token.operatorSend(signer, channel.beneficiary, amount, "", channel.data);

        return true;
    }

    function getChannel(bytes32 _channelId) public view returns (address, address, bytes, uint256) {
        Channel storage channel = channels[_channelId];
        return (
            channel.beneficiary,
            channel.payer,
            channel.data,
            channel.totalSent
        );
    }
}
