pragma solidity 0.4.24;

import "../contracts/NOIACrowdsale.sol";


contract TestNOIACrowdsale is NOIACrowdsale {

    uint256 private testNow;

    constructor(address token, address whitelist) public NOIACrowdsale(token, whitelist) {

    }

    function usdToTokensTest(uint256 _usd, uint8 _stage) public view returns (uint256) {
        return usdToTokens(_usd, _stage);
    }

    function tokensToUsdTest(uint256 _tokens, uint8 _stage) public view returns (uint256) {
        return tokensToUsd(_tokens, _stage);
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
    
    function getStageDiscount(uint256 index) public view returns (uint256) {
        return stages[index].discount;
    }
}