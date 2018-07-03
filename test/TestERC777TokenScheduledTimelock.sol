pragma solidity 0.4.24;

import "../contracts/ERC777TokenScheduledTimelock.sol";


contract TestERC777TokenScheduledTimelock is ERC777TokenScheduledTimelock {

    uint256 private testNow;

    constructor(address token, address beneficiary) public ERC777TokenScheduledTimelock(token, beneficiary) {

    }

    function setNow(uint256 _now) public {
        testNow = _now;
    }

    function getNowTest() public view returns (uint256) {
        return getNow();
    }

    function getNow() internal view returns (uint256) {
        return testNow;
    }
}