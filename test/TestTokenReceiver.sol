pragma solidity 0.5.7;

import "../contracts/ITokenReceiver.sol";
import "../contracts/NOIAToken.sol";

contract TestTokenReceiver is ITokenReceiver {
    address public from;
    address public to;
    uint256 public amount;
    address public token;

    constructor(address _token) public {
        token = _token;
        NOIAToken(_token).register();
    }

    function unregister() public {
        NOIAToken(token).unregister();
    }

    function tokensReceived(
        address _from,
        address _to,
        uint256 _amount
    ) external {
        from = _from;
        to = _to;
        amount = _amount;
    }
}