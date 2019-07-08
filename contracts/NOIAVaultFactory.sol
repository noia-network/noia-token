pragma solidity 0.5.10;

import "./NOIAVault.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/token/ERC20/IERC20.sol";


contract NOIAVaultFactory {
    using SafeMath for uint256;
    //address public constant NOIA_TOKEN_ADDRESS = 0xfc858154C0b2c4A3323046Fb505811F110EBdA57; // uncomment before deployment
    //address public constant NOIA_VAULT_ADDRESS = 0xfc858154C0b2c4A3323046Fb505811F110EBdA57; // uncomment and fix before deployment
    address public NOIA_TOKEN_ADDRESS; // remove before deployment
    address public NOIA_VAULT_ADDRESS; // remove before deployment

    mapping(address => address[]) public vaults;

    event NOIAVaultCreated(address indexed beneficiary, uint256 lockTill, address vaultAddress);

    constructor(address _noiaVaultAddress, address _noiaTokenAddress) public { // remove before deployment
        NOIA_VAULT_ADDRESS = _noiaVaultAddress;
        NOIA_TOKEN_ADDRESS = _noiaTokenAddress;
    }

    function createVault(address _beneficiary, uint256 _lockTill) public {
        address clone = createClone(NOIA_VAULT_ADDRESS);
        //NOIAVault(clone).initialize(_beneficiary, _lockTill); // uncomment before deployment
        NOIAVault(clone).initialize(_beneficiary, _lockTill, NOIA_TOKEN_ADDRESS); // remove before deployment
        vaults[_beneficiary].push(clone);

        emit NOIAVaultCreated(_beneficiary, _lockTill, clone);
    }

    function release(address _beneficiary) public returns (uint256) {
        uint256 released = 0;
        address[] memory addrs = vaults[_beneficiary];
        for (uint256 i = 0; i < addrs.length; i++) {
            released = released.add(NOIAVault(addrs[i]).release());
        }
        return released;
    }

    function unlockableBalanceOf(address _beneficiary) public view returns (uint256) {
        uint256 total = 0;
        address[] memory addrs = vaults[_beneficiary];
        for (uint256 i = 0; i < addrs.length; i++) {
            NOIAVault vault = NOIAVault(addrs[i]);
            if (vault.lockTill() < now) {
                total = total.add(IERC20(NOIA_TOKEN_ADDRESS).balanceOf(addrs[i]));
            }
        }
        return total;
    }

    function totalBalanceOf(address _beneficiary) public view returns (uint256) {
        uint256 total = 0;
        address[] memory addrs = vaults[_beneficiary];
        for (uint256 i = 0; i < addrs.length; i++) {
            total = total.add(IERC20(NOIA_TOKEN_ADDRESS).balanceOf(addrs[i]));
        }
        return total;
    }

    /* ERC-1167 minimal proxy contract */
    function createClone(address target) internal returns (address result) {
        bytes20 targetBytes = bytes20(target);
        assembly {
            let clone := mload(0x40)
            mstore(clone, 0x3d602d80600a3d3981f3363d3d373d3d3d363d73000000000000000000000000)
            mstore(add(clone, 0x14), targetBytes)
            mstore(add(clone, 0x28), 0x5af43d82803e903d91602b57fd5bf30000000000000000000000000000000000)
            result := create(0, clone, 0x37)
        }
    }
}