pragma solidity 0.5.10;

import "./NOIAToken.sol";
import "./ITokenReceiver.sol";


contract NOIAVault is ITokenReceiver {
    //address public constant NOIA_TOKEN_ADDRESS = 0xfc858154C0b2c4A3323046Fb505811F110EBdA57; // uncomment before deployment
    address public NOIA_TOKEN_ADDRESS; // remove before deployment

    address public beneficiary;
    uint256 public lockTill;

    //function initialize(address _beneficiary, uint256 _lockTill) public { // uncomment before deployment
    function initialize(address _beneficiary, uint256 _lockTill, address noiaTokenAddress) public { // remove before deployment
        require(beneficiary == address(0), "Vault is already initialized");
        require(_beneficiary != address(0), "Locking to the zero address");
        require(_lockTill > now, "Locking time must be in future");

        NOIA_TOKEN_ADDRESS = noiaTokenAddress; // remove before deployment

        beneficiary = _beneficiary;
        lockTill = _lockTill;
        NOIAToken(NOIA_TOKEN_ADDRESS).register();
    }

    function release() public returns (uint256) {
        if (lockTill > now) return 0;

        NOIAToken token = NOIAToken(NOIA_TOKEN_ADDRESS);
        uint256 balance = token.balanceOf(address(this));
        if (balance > 0) {
            token.transfer(beneficiary, balance);
        }
        return balance;
    }

    function tokensReceived(
        address,
        address,
        uint256
    ) external {
        release();
    }
}