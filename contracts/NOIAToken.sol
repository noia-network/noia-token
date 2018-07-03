pragma solidity 0.4.24;

import "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";

import "./eip820/contracts/ERC820Implementer.sol";
import "./erc777/contracts/ERC20Token.sol";
import "./erc777/contracts/ERC777Token.sol";
import "./erc777/contracts/ERC777TokensSender.sol";
import "./erc777/contracts/ERC777TokensRecipient.sol";
import "./TokenRecoverable.sol";
import "./ECRecovery.sol";


contract NOIAToken is TokenRecoverable, ERC20Token, ERC777Token, ERC820Implementer {
    using SafeMath for uint256;
    using ECRecovery for bytes32;

    enum State { Minting, Trading, Burning }

    string private constant name_ = "NOIA";
    string private constant symbol_ = "NOIA";

    uint256 private constant granularity_ = 1;
    uint256 private totalSupply_;

    mapping(address => uint256) private balances;
    mapping(address => mapping(address => bool)) private authorized;
    mapping(address => mapping(address => uint256)) private allowed;
    mapping(address => uint256) public authorizationNonces;
    mapping(bytes => bool) private signatures;

    State public state = State.Minting;

    event MintFinished();

    /// @notice Constructor to create a NOIAToken
    constructor() public {
        setInterfaceImplementation("ERC20Token", address(this));
        setInterfaceImplementation("ERC777Token", address(this));
    }

    modifier canMint() {
        require(state == State.Minting, "Not in 'Minting' state!");
        _;
    }       

    modifier canTrade() {
        require(state == State.Trading || state == State.Burning, "Not in 'Trading' or 'Burning' state!");
        _;
    }

    modifier canBurn() {
        require(state == State.Burning, "Not in 'Burning' state!");
        _;
    }

    /* -- ERC777 Interface Implementation -- */
    //
    /// @return the name of the token
    function name() public view returns (string) { return name_; }

    /// @return the symbol of the token
    function symbol() public view returns (string) { return symbol_; }

    /// @return the granularity of the token
    function granularity() public view returns (uint256) { return granularity_; }

    /// @return the total supply of the token
    function totalSupply() public view returns (uint256) { return totalSupply_; }

    /// @notice Return the account balance of some account
    /// @param _tokenHolder Address for which the balance is returned
    /// @return the balance of `_tokenAddress`.
    function balanceOf(address _tokenHolder) public view returns (uint256) { return balances[_tokenHolder]; }

    /// @notice sends tokens using signature to recover token sender
    /// @param _to the address of the recepient
    /// @param _amount tokens to send
    /// @param _fee amound of tokens which goes to msg.sender
    /// @param _data arbitrary user data
    /// @param _nonce value to protect from replay attacks
    /// @param _sig concatenated r,s,v values
    /// @return `true` if the token transfer is success, otherwise should fail
    function sendByCheque(address _to, uint256 _amount, uint256 _fee, bytes _data, uint256 _nonce, bytes _sig) public returns (bool) {
        doSendByCheque(_to, _amount, _fee, _data, _nonce, _sig, true);
        return true;
    }

    /// @notice transfers tokens in ERC20 compatible way using signature to recover token sender
    /// @param _to the address of the recepient
    /// @param _amount tokens to transfer
    /// @param _fee amound of tokens which goes to msg.sender
    /// @param _data arbitrary user data
    /// @param _nonce value to protect from replay attacks
    /// @param _sig concatenated r,s,v values
    /// @return `true` if the token transfer is success, otherwise should fail
    function transferByCheque(address _to, uint256 _amount, uint256 _fee, bytes _data, uint256 _nonce, bytes _sig) public returns (bool) {
        doSendByCheque(_to, _amount, _fee, _data, _nonce, _sig, false);
        return true;
    }

    /// @notice Send `_amount` of tokens to address `_to` passing `_userData` to the recipient
    /// @param _to The address of the recipient
    /// @param _amount The number of tokens to be sent
    function send(address _to, uint256 _amount, bytes _userData) public {
        doSend(msg.sender, _to, _amount, _userData, msg.sender, "", true);
    }

    /// @notice Authorize a third party `_operator` to manage (send) `msg.sender`'s tokens.
    /// @param _operator The operator that wants to be Authorized
    function authorizeOperator(address _operator) public {
        require(_operator != msg.sender);
        authorized[_operator][msg.sender] = true;
        emit AuthorizedOperator(_operator, msg.sender);
    }

    /// @notice Revoke a third party `_operator`'s rights to manage (send) `msg.sender`'s tokens.
    /// @param _operator The operator that wants to be Revoked
    function revokeOperator(address _operator) public {
        require(_operator != msg.sender);
        authorized[_operator][msg.sender] = false;
        emit RevokedOperator(_operator, msg.sender);
    }

    /// @notice Authorize a third party `_operator` to manage (send) `msg.sender`'s tokens with issued signature.
    /// @param _operator The operator that wants to be Authorized
    function authorizeOperatorWithSignature(address _operator, uint256 _nonce, bytes _sig) public {
        address signer = doOperatorAuthorizationWithSignature(true, _operator, _nonce, _sig);
        emit AuthorizedOperator(_operator, signer);
    }

    /// @notice Revoke a third party `_operator`'s rights to manage (send) `msg.sender`'s tokens with issued signature.
    /// @param _operator The operator that wants to be Revoked
    function revokeOperatorWithSignature(address _operator, uint256 _nonce, bytes _sig) public {
        address signer = doOperatorAuthorizationWithSignature(false, _operator, _nonce, _sig);
        emit RevokedOperator(_operator, signer);
    }

    /// @notice Check whether the `_operator` address is allowed to manage the tokens held by `_tokenHolder` address.
    /// @param _operator address to check if it has the right to manage the tokens
    /// @param _tokenHolder address which holds the tokens to be managed
    /// @return `true` if `_operator` is authorized for `_tokenHolder`
    function isOperatorFor(address _operator, address _tokenHolder) public view returns (bool) {
        return _operator == _tokenHolder || authorized[_operator][_tokenHolder];
    }

    /// @notice Send `_amount` of tokens on behalf of the address `from` to the address `to`.
    /// @param _from The address holding the tokens being sent
    /// @param _to The address of the recipient
    /// @param _amount The number of tokens to be sent
    /// @param _userData Data generated by the user to be sent to the recipient
    /// @param _operatorData Data generated by the operator to be sent to the recipient
    function operatorSend(address _from, address _to, uint256 _amount, bytes _userData, bytes _operatorData) public {
        require(isOperatorFor(msg.sender, _from));
        doSend(_from, _to, _amount, _userData, msg.sender, _operatorData, true);
    }

    /* -- Mint And Burn Functions (not part of the ERC777 standard, only the Events/tokensReceived are) -- */
    //
    /// @notice Generates `_amount` tokens to be assigned to `_tokenHolder`
    ///  Sample mint function to showcase the use of the `Minted` event and the logic to notify the recipient.
    /// @param _tokenHolder The address that will be assigned the new tokens
    /// @param _amount The quantity of tokens generated
    function mint(address _tokenHolder, uint256 _amount) public onlyOwner canMint {
        requireMultiple(_amount);
        totalSupply_ = totalSupply_.add(_amount);
        balances[_tokenHolder] = balances[_tokenHolder].add(_amount);

        callRecipient(msg.sender, address(0), _tokenHolder, _amount, "", "", true);

        emit Minted(msg.sender, _tokenHolder, _amount, "");
        emit Transfer(address(0), _tokenHolder, _amount);
    }

    /// @notice Burns `_amount` tokens from `_tokenHolder`
    /// Sample burn function to showcase the use of the `Burned` event.
    /// @param _amount The quantity of tokens to burn
    function burn(uint256 _amount, bytes _userData, bytes _operatorData) public canBurn {
        requireMultiple(_amount);

        callSender(msg.sender, msg.sender, address(0), _amount, _userData, _operatorData);

        require(balances[msg.sender] >= _amount);

        balances[msg.sender] = balances[msg.sender].sub(_amount);
        totalSupply_ = totalSupply_.sub(_amount);

        emit Burned(msg.sender, msg.sender, _amount, _userData, _operatorData);
        emit Transfer(msg.sender, address(0), _amount);
    }

    /// @notice For Backwards compatibility
    /// @return The decimls of the token. Forced to 18 in ERC777.
    function decimals() public view returns (uint8) { return uint8(18); }

    /// @notice ERC20 backwards compatible transfer.
    /// @param _to The address of the recipient
    /// @param _amount The number of tokens to be transferred
    /// @return `true`, if the transfer can't be done, it should fail.
    function transfer(address _to, uint256 _amount) public returns (bool success) {
        doSend(msg.sender, _to, _amount, "", msg.sender, "", false);
        return true;
    }

    /// @notice ERC20 backwards compatible transferFrom.
    /// @param _from The address holding the tokens being transferred
    /// @param _to The address of the recipient
    /// @param _amount The number of tokens to be transferred
    /// @return `true`, if the transfer can't be done, it should fail.
    function transferFrom(address _from, address _to, uint256 _amount) public returns (bool success) {
        require(_amount <= allowed[_from][msg.sender]);

        // Cannot be after doSend because of tokensReceived re-entry
        allowed[_from][msg.sender] = allowed[_from][msg.sender].sub(_amount);
        doSend(_from, _to, _amount, "", msg.sender, "", false);
        return true;
    }

    /**
    * @dev Approve the passed address to spend the specified amount of tokens on behalf of msg.sender.
    *
    * Beware that changing an allowance with this method brings the risk that someone may use both the old
    * and the new allowance by unfortunate transaction ordering. One possible solution to mitigate this
    * race condition is to first reduce the spender's allowance to 0 and set the desired value afterwards:
    * https://github.com/ethereum/EIPs/issues/20#issuecomment-263524729
    * @param _spender The address which will spend the funds.
    * @param _amount The amount of tokens to be spent.
    */
    function approve(address _spender, uint256 _amount) public returns (bool success) {
        allowed[msg.sender][_spender] = _amount;
        emit Approval(msg.sender, _spender, _amount);
        return true;
    }

    /**
    * @dev Increase the amount of tokens that an owner allowed to a spender.
    *
    * approve should be called when allowed[_spender] == 0. To increment
    * allowed value is better to use this function to avoid 2 calls (and wait until
    * the first transaction is mined)
    * From MonolithDAO Token.sol
    * @param _spender The address which will spend the funds.
    * @param _addedValue The amount of tokens to increase the allowance by.
    */
    function increaseApproval(address _spender, uint256 _addedValue) public returns (bool) {
        allowed[msg.sender][_spender] = allowed[msg.sender][_spender].add(_addedValue);
        emit Approval(msg.sender, _spender, allowed[msg.sender][_spender]);
        return true;
    }

    /**
    * @dev Decrease the amount of tokens that an owner allowed to a spender.
    *
    * approve should be called when allowed[_spender] == 0. To decrement
    * allowed value is better to use this function to avoid 2 calls (and wait until
    * the first transaction is mined)
    * From MonolithDAO Token.sol
    * @param _spender The address which will spend the funds.
    * @param _subtractedValue The amount of tokens to decrease the allowance by.
    */
    function decreaseApproval(address _spender, uint256 _subtractedValue) public returns (bool) {
        uint256 oldValue = allowed[msg.sender][_spender];
        if (_subtractedValue > oldValue) {
            allowed[msg.sender][_spender] = 0;
        } else {
            allowed[msg.sender][_spender] = oldValue.sub(_subtractedValue);
        }
        emit Approval(msg.sender, _spender, allowed[msg.sender][_spender]);
        return true;
    }

    /// @notice ERC20 backwards compatible allowance.
    ///  This function makes it easy to read the `allowed[]` map
    /// @param _owner The address of the account that owns the token
    /// @param _spender The address of the account able to transfer the tokens
    /// @return Amount of remaining tokens of _owner that _spender is allowed
    ///  to spend
    function allowance(address _owner, address _spender) public view returns (uint256 remaining) {
        return allowed[_owner][_spender];
    }

    /**
     * @dev Function to stop minting new tokens.
     * @return True if the operation was successful.
     */
    function finishMinting() public onlyOwner canMint returns (bool) {
        state = State.Trading;
        emit MintFinished();
        return true;
    }

    function enableBurn(bool enable) public onlyOwner returns (bool) {
        require(state == State.Trading || state == State.Burning);
        state = (enable ? State.Burning : State.Trading);
    }

    /* -- Helper Functions -- */
    //
    /// @notice Internal function that ensures `_amount` is multiple of the granularity
    /// @param _amount The quantity that want's to be checked
    function requireMultiple(uint256 _amount) internal pure {
        require(_amount.div(granularity_).mul(granularity_) == _amount);
    }

    /// @notice Check whether an address is a regular address or not.
    /// @param _addr Address of the contract that has to be checked
    /// @return `true` if `_addr` is a regular address (not a contract)
    function isRegularAddress(address _addr) internal view returns (bool) {
        if (_addr == 0) { return false; }
        uint size;
        assembly { size := extcodesize(_addr) } // solhint-disable-line no-inline-assembly
        return size == 0;
    }

    /// @notice Helper function actually performing the sending of tokens.
    /// @param _from The address holding the tokens being sent
    /// @param _to The address of the recipient
    /// @param _amount The number of tokens to be sent
    /// @param _userData Data generated by the user to be passed to the recipient
    /// @param _operatorData Data generated by the operator to be passed to the recipient
    /// @param _preventLocking `true` if you want this function to throw when tokens are sent to a contract not
    ///  implementing `erc777_tokenHolder`.
    ///  ERC777 native Send functions MUST set this parameter to `true`, and backwards compatible ERC20 transfer
    ///  functions SHOULD set this parameter to `false`.
    function doSend(
        address _from,
        address _to,
        uint256 _amount,
        bytes _userData,
        address _operator,
        bytes _operatorData,
        bool _preventLocking
    )
        private
        canTrade
    {
        requireMultiple(_amount);

        callSender(_operator, _from, _to, _amount, _userData, _operatorData);

        require(_to != address(0));          // forbid sending to 0x0 (=burning)
        require(balances[_from] >= _amount); // ensure enough funds

        balances[_from] = balances[_from].sub(_amount);
        balances[_to] = balances[_to].add(_amount);

        callRecipient(_operator, _from, _to, _amount, _userData, _operatorData, _preventLocking);

        emit Sent(_operator, _from, _to, _amount, _userData, _operatorData);
        emit Transfer(_from, _to, _amount);
    }

    /// @notice Helper function that checks for ERC777TokensRecipient on the recipient and calls it.
    ///  May throw according to `_preventLocking`
    /// @param _from The address holding the tokens being sent
    /// @param _to The address of the recipient
    /// @param _amount The number of tokens to be sent
    /// @param _userData Data generated by the user to be passed to the recipient
    /// @param _operatorData Data generated by the operator to be passed to the recipient
    /// @param _preventLocking `true` if you want this function to throw when tokens are sent to a contract not
    ///  implementing `ERC777TokensRecipient`.
    ///  ERC777 native Send functions MUST set this parameter to `true`, and backwards compatible ERC20 transfer
    ///  functions SHOULD set this parameter to `false`.
    function callRecipient(
        address _operator,
        address _from,
        address _to,
        uint256 _amount,
        bytes _userData,
        bytes _operatorData,
        bool _preventLocking
    ) private {
        address recipientImplementation = interfaceAddr(_to, "ERC777TokensRecipient");
        if (recipientImplementation != address(0)) {
            ERC777TokensRecipient(recipientImplementation).tokensReceived(
                _operator, _from, _to, _amount, _userData, _operatorData);
        } else if (_preventLocking) {
            require(isRegularAddress(_to));
        }
    }

    /// @notice Helper function that checks for ERC777TokensSender on the sender and calls it.
    ///  May throw according to `_preventLocking`
    /// @param _from The address holding the tokens being sent
    /// @param _to The address of the recipient
    /// @param _amount The amount of tokens to be sent
    /// @param _userData Data generated by the user to be passed to the recipient
    /// @param _operatorData Data generated by the operator to be passed to the recipient
    ///  implementing `ERC777TokensSender`.
    ///  ERC777 native Send functions MUST set this parameter to `true`, and backwards compatible ERC20 transfer
    ///  functions SHOULD set this parameter to `false`.
    function callSender(
        address _operator,
        address _from,
        address _to,
        uint256 _amount,
        bytes _userData,
        bytes _operatorData
    ) private {
        address senderImplementation = interfaceAddr(_from, "ERC777TokensSender");
        if (senderImplementation != address(0)) {
            ERC777TokensSender(senderImplementation).tokensToSend(
                _operator, _from, _to, _amount, _userData, _operatorData);
        }
    }

    function doSendByCheque(address _to, uint256 _amount, uint256 _fee, bytes _data, uint256 _nonce, bytes _sig, bool _preventLocking) private {
        require(_to != address(0));
        require(_to != address(this)); // token contract does not accept own tokens

        require(signatures[_sig] == false);
        signatures[_sig] = true;

        bytes memory packed;
        if (_preventLocking) {
            packed = abi.encodePacked(address(this), _to, _amount, _fee, _data, _nonce);
        } else {
            packed = abi.encodePacked(address(this), _to, _amount, _fee, _data, _nonce, "ERC20Compat");
        }

        address signer = keccak256(packed)
            .toEthSignedMessageHash()
            .recover(_sig); // same security considerations as in Ethereum TX
        
        require(signer != address(0));

        uint256 total = _amount.add(_fee);
        require(balances[signer] >= total);

        doSend(signer, _to, _amount, _data, msg.sender, "", _preventLocking);
        if (_fee > 0) {
            doSend(signer, msg.sender, _fee, "", msg.sender, "", _preventLocking);
        }
    }

    function doOperatorAuthorizationWithSignature(bool _authorize, address _operator, uint256 _nonce, bytes _sig) private returns (address) {
        address signer = keccak256(abi.encodePacked(address(this), _operator, _nonce, _authorize))
            .toEthSignedMessageHash()
            .recover(_sig); // same security considerations as in Ethereum TX
        require(signer != address(0));
        require(_operator != signer);
        require(authorizationNonces[signer] == _nonce);
        authorizationNonces[signer] = _nonce.add(1);
        authorized[_operator][signer] = _authorize;
        return signer;
    }
}
