pragma solidity 0.4.24;

import { ERC777Token } from "./erc777/contracts/ERC777Token.sol";
import { ERC777TokensRecipient } from "./erc777/contracts/ERC777TokensRecipient.sol";
import { Ownable } from "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import { SafeMath } from "openzeppelin-solidity/contracts/math/SafeMath.sol";
import { ERC820Implementer } from "./eip820/contracts/ERC820Implementer.sol";


contract ERC777TokenScheduledTimelock is ERC820Implementer, ERC777TokensRecipient, Ownable {
    using SafeMath for uint256;

    ERC777Token public token;
    uint256 public totalVested;

    struct Timelock {
        uint256 till;
        uint256 amount;
    }

    Timelock[] public schedule;

    bool public finalized = false;

    address public beneficiary;

    event Released(address to, uint256 amount);

    constructor(address _token, address _beneficiary) public {
        setInterfaceImplementation("ERC777TokensRecipient", this);
        address tokenAddress = interfaceAddr(_token, "ERC777Token");
        require(tokenAddress != address(0));
        require(_beneficiary != address(0));
        token = ERC777Token(tokenAddress);
        beneficiary = _beneficiary;
    }

    function scheduleTimelock(uint256 _lockTokenAmount, uint256 _lockTill) public onlyOwner {
        require(!finalized);
        require(_lockTill > getNow());
        require(token.balanceOf(address(this)) >= totalVested.add(_lockTokenAmount));
        totalVested = totalVested.add(_lockTokenAmount);

        schedule.push(Timelock({ till: _lockTill, amount: _lockTokenAmount }));
    }

    function finalize() public onlyOwner {
        require(!finalized);
        finalized = true;
    }

    function release() public {
        require(finalized);
        address to = beneficiary;
        uint256 tokens = 0;
        uint256 till;
        uint256 n = schedule.length;
        uint256 timestamp = getNow();
        for (uint256 i = 0; i < n; i++) {
            Timelock storage timelock = schedule[i];
            till = timelock.till;
            if (till > 0 && till <= timestamp) {
                tokens = tokens.add(timelock.amount);
                timelock.amount = 0;
                timelock.till = 0;
            }
        }
        if (tokens > 0) {
            totalVested = totalVested.sub(tokens);
            token.send(to, tokens, "");
            emit Released(to, tokens);
        }
    }

    function tokensReceived(address, address, address, uint256, bytes, bytes) public {
        require(msg.sender == address(token));
        require(!finalized);
    }

    function getScheduledTimelockCount() public view returns (uint256) {
        return schedule.length;
    }

    function getNow() internal view returns (uint256) {
        return now; // solhint-disable-line
    }
}