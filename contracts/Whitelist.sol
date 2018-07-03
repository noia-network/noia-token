pragma solidity 0.4.24;

import "openzeppelin-solidity/contracts/ownership/Ownable.sol";


contract Whitelist is Ownable {
    mapping(address => bool) private whitelist;

    event Whitelisted(address indexed who);

    function addAddress(address who) public onlyOwner {
        require(who != address(0));
        whitelist[who] = true;
        emit Whitelisted(who); // solhint-disable-line
    }

    function addAddresses(address[] addresses) public onlyOwner {
        require(addresses.length <= 100);
        for (uint8 i = 0; i < addresses.length; i++) {
            address who = addresses[i];
            require(who != address(0));
            whitelist[who] = true;
            emit Whitelisted(who); // solhint-disable-line
        }
    }

    function isWhitelisted(address who) public view returns (bool) {
        return whitelist[who];
    }
}
