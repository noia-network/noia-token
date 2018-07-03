pragma solidity 0.4.24;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "./NOIAToken.sol";
import "./Whitelist.sol";
import "./ERC777TokenScheduledTimelock.sol";
import "./ERC777TokenTimelock.sol";
import "./TokenRecoverable.sol";
import "./ExchangeRateConsumer.sol";


contract NOIACrowdsale is TokenRecoverable, ExchangeRateConsumer {
    using SafeMath for uint256;

    // Wallet where all ether will be stored
    address public constant WALLET = 0x1111111111111111111111111111111111111111;
    // Team wallet
    address public constant TEAM_WALLET = 0x2222222222222222222222222222222222222222;
    // Advisors wallet
    address public constant ADVISORS_WALLET = 0x3333333333333333333333333333333333333333;
    // Community wallet
    address public constant COMMUNITY_WALLET = 0x4444444444444444444444444444444444444444;
    // Future wallet
    address public constant FUTURE_WALLET = 0x5555555555555555555555555555555555555555;

    uint256 public constant ICO_TOKENS = 450000000e18; // 450 000 000 tokens
    uint256 public constant PRE_SALE_TOKENS = 1e18; // 1 token
    uint256 public constant START_TIME = 1531749600; // 2018/07/16 14:00 UTC
    uint256 public constant END_TIME = 1534428000; // 2018/08/16 14:00 UTC
    uint256 public constant TOKEN_PRICE_NOMINATOR = 56; // 1 token costs 0.056 USD
    uint256 public constant TOKEN_PRICE_DENOMINATOR = 1000; // 0.056 = 56 / 1000
    uint256 public constant MIN_INVESTMENT = 0.05 ether;

    uint8 public constant ICO_PERCENT = 45;
    uint8 public constant TEAM_PERCENT = 15;
    uint8 public constant ADVISORS_PERCENT = 5;
    uint8 public constant COMMUNITY_PERCENT = 10;
    uint8 public constant FUTURE_PERCENT = 25;

    struct Stage {
        uint256 cap;
        uint256 discount;
    }

    Stage[5] internal stages;

    // The token being sold
    NOIAToken public token;
    Whitelist public whitelist;
    ERC777TokenScheduledTimelock public teamTimelock;
    ERC777TokenTimelock public futureTimelock;

    // amount of raised money in USD
    uint256 public preSaleTokensLeft = PRE_SALE_TOKENS;
    // holds USD sum received from a particular address
    mapping(address => uint256) public totalUsdReceived;
    uint256 public maxPurchaseUsd = 9000e18; // 9000 USD
    address public tokenMinter;
    address public rateOracle;

    uint8 public currentStage = 0;
    bool public isFinalized = false;

    /**
    * event for token purchase logging
    * @param purchaser who paid for the tokens
    * @param beneficiary who got the tokens
    * @param weis paid for purchase
    * @param usd paid for purchase
    * @param amount amount of tokens purchased
    */
    event TokenPurchase(
        address indexed purchaser, 
        address indexed beneficiary, 
        uint256 weis, 
        uint256 usd, 
        uint256 rate, 
        uint256 amount
    );
    
    event PurchaseLimitReached(
        address indexed purchaser, 
        address indexed beneficiary, 
        uint256 weis, 
        uint256 usd, 
        uint256 rate, 
        uint256 purchaseLimit
    );

    event Finalized();
    /**
     * When there no tokens left to mint and token minter tries to manually mint tokens
     * this event is raised to signal how many tokens we have to charge back to purchaser
     */
    event ManualTokenMintRequiresRefund(address indexed purchaser, uint256 value);

    constructor(address _token, address _whitelist) public {
        require(_token != address(0));
        token = NOIAToken(_token);
        require(token.granularity() == 1);

        require(_whitelist != address(0));
        whitelist = Whitelist(_whitelist);

        stages[0] = Stage({ discount: 20, cap: 50000000e18 });  // 50 000 000 tokens
        stages[1] = Stage({ discount: 15, cap: 50000000e18 });  // 50 000 000 tokens
        stages[2] = Stage({ discount: 10, cap: 50000000e18 });  // 50 000 000 tokens
        stages[3] = Stage({ discount: 5, cap: 50000000e18 });   // 50 000 000 tokens
        stages[4] = Stage({ discount: 0, cap: uint256(250000000e18).sub(PRE_SALE_TOKENS) }); // 250 000 000 tokens - PRE_SALE_TOKENS
    }

    function () external payable {
        buyTokens(msg.sender);
    }

    function mintPreSaleTokens(address[] _receivers, uint256[] _amounts) external {
        require(msg.sender == tokenMinter || msg.sender == owner);
        require(_receivers.length > 0 && _receivers.length <= 100);
        require(_receivers.length == _amounts.length);
        require(!isFinalized);
        require(preSaleTokensLeft > 0);
        uint256 sum = 0;
        for (uint256 i = 0; i < _receivers.length; i++) {
            address receiver = _receivers[i];
            require(receiver != address(0));

            uint256 amount = _amounts[i];
            sum = sum.add(amount);

            require(preSaleTokensLeft >= sum);
            
            token.mint(receiver, amount);
        }
        preSaleTokensLeft = preSaleTokensLeft.sub(sum);
    }

    function mintTokens(address[] _receivers, uint256[] _amounts) external {
        require(msg.sender == tokenMinter || msg.sender == owner);
        require(_receivers.length > 0 && _receivers.length <= 100);
        require(_receivers.length == _amounts.length);
        require(!isFinalized);
        require(currentStage < stages.length);

        for (uint256 i = 0; i < _receivers.length; i++) {
            address receiver = _receivers[i];
            uint256 amount = _amounts[i];

            require(receiver != address(0));
            require(amount > 0);

            uint256 excessTokens = updateStageCap(amount);

            token.mint(receiver, amount.sub(excessTokens));
            if (excessTokens > 0) {
                emit ManualTokenMintRequiresRefund(receiver, excessTokens); // solhint-disable-line
            }
        }
    }

    function buyTokens(address _beneficiary) public payable {
        require(_beneficiary != address(0));
        validatePurchase();
        uint256 weiReceived = msg.value;
        uint256 usdReceived = weiToUsd(weiReceived);
        
        uint8 stageIndex = currentStage;
        uint256 tokens = usdToTokens(usdReceived, stageIndex);
        uint256 weiToReturn = 0;
        uint256 excessTokens = updateStageCap(tokens);
        if (excessTokens > 0) { // out of tokens
            uint256 usdToReturn = tokensToUsd(excessTokens, stageIndex);
            usdReceived = usdReceived.sub(usdToReturn);
            weiToReturn = weiToReturn.add(usdToWei(usdToReturn));
            weiReceived = weiReceived.sub(weiToReturn);
            tokens = tokens.sub(excessTokens);
        }

        uint256 usdReceivedSum = totalUsdReceived[msg.sender].add(usdReceived);
        if (usdReceivedSum > maxPurchaseUsd) {
            emit PurchaseLimitReached(msg.sender, _beneficiary, weiReceived, usdReceivedSum, exchangeRate, maxPurchaseUsd);
            msg.sender.transfer(weiReceived);
            return;
        }
        totalUsdReceived[msg.sender] = usdReceivedSum;

        token.mint(_beneficiary, tokens);
        WALLET.transfer(weiReceived);
        emit TokenPurchase(msg.sender, _beneficiary, weiReceived, usdReceived, exchangeRate, tokens); // solhint-disable-line
        if (weiToReturn > 0) {
            msg.sender.transfer(weiToReturn);
        }
    }

    /**
    * @dev Must be called after crowdsale ends, to do some extra finalization
    * work. Calls the contract's finalization function.
    */
    function finalize() public onlyOwner {
        require(!isFinalized);
        require(getNow() > END_TIME || token.totalSupply() == ICO_TOKENS);
        require(preSaleTokensLeft == 0);

        uint256 totalSupply = token.totalSupply();

        token.mint(ADVISORS_WALLET, uint256(ADVISORS_PERCENT).mul(totalSupply).div(ICO_PERCENT));
        token.mint(COMMUNITY_WALLET, uint256(COMMUNITY_PERCENT).mul(totalSupply).div(ICO_PERCENT));

        uint256 teamTokens = uint256(TEAM_PERCENT).mul(totalSupply).div(ICO_PERCENT);
        uint256 futureTokens = uint256(FUTURE_PERCENT).mul(totalSupply).div(ICO_PERCENT);

        uint256 oneYear = (365 days);

        teamTimelock = new ERC777TokenScheduledTimelock(address(token), TEAM_WALLET);
        token.mint(address(teamTimelock), teamTokens);

        futureTimelock = new ERC777TokenTimelock(address(token), FUTURE_WALLET, START_TIME.add(oneYear.mul(3)));
        token.mint(address(futureTimelock), futureTokens);
        futureTimelock.finalize();

        token.finishMinting();
        token.transferOwnership(owner);

        uint256 halfOfYear = oneYear.div(2);

        uint256 period = START_TIME;
        for (uint256 i = 5; i > 0; i--) {
            period = period.add(halfOfYear);
            /** This division tries to distribute rounding errors evenly between periods
             * For example, if tokens to split is 17, then splitted tokens between periods will be [3,3,3,4,4]
             */
            uint256 teamTokensPerPeriod = teamTokens.div(i);
            teamTokens = teamTokens.sub(teamTokensPerPeriod);
            teamTimelock.scheduleTimelock(teamTokensPerPeriod, period);
        }
        teamTimelock.finalize();

        emit Finalized(); // solhint-disable-line

        isFinalized = true;
    }

    function setTokenMinter(address _tokenMinter) public onlyOwner {
        require(_tokenMinter != address(0));
        tokenMinter = _tokenMinter;
    }

    function setMaxPurchaseUsd(uint256 _maxPurchaseUsd) public onlyOwner {
        require(_maxPurchaseUsd > 0);
        maxPurchaseUsd = _maxPurchaseUsd;
    }

    function updateStageCap(uint256 _tokens) internal returns (uint256) {
        uint256 excessTokens = _tokens;
        while (excessTokens > 0 && currentStage < stages.length) {
            Stage storage stage = stages[currentStage];
            if (excessTokens < stage.cap) {
                stage.cap = stage.cap.sub(excessTokens);
                excessTokens = 0;
            } else {
                excessTokens = excessTokens.sub(stage.cap);
                stage.cap = 0;
                currentStage++;
            }
        }
        return excessTokens;
    }

    function weiToUsd(uint256 _wei) internal view returns (uint256) {
        return _wei.mul(exchangeRate).div(10 ** uint256(EXCHANGE_RATE_DECIMALS));
    }

    function usdToWei(uint256 _usd) internal view returns (uint256) {
        return _usd.mul(10 ** uint256(EXCHANGE_RATE_DECIMALS)).div(exchangeRate);
    }

    function usdToTokens(uint256 _usd, uint8 _stage) internal view returns (uint256) {
        return _usd.mul(100 * TOKEN_PRICE_DENOMINATOR).div(uint256(100).sub(stages[_stage].discount).mul(TOKEN_PRICE_NOMINATOR));
    }

    function tokensToUsd(uint256 _tokens, uint8 _stage) internal view returns (uint256) {
        return _tokens.mul(TOKEN_PRICE_NOMINATOR).mul(uint256(100).sub(stages[_stage].discount)).div(100 * TOKEN_PRICE_DENOMINATOR);
    }

    function validatePurchase() internal view {
        require(!isFinalized);
        require(msg.value >= MIN_INVESTMENT);
        require(currentStage < stages.length);
        require(getNow() >= START_TIME && getNow() <= END_TIME);
        require(whitelist.isWhitelisted(msg.sender));
        require(token.totalSupply() < ICO_TOKENS);
    }

    function getNow() internal view returns (uint256) {
        return now; // solhint-disable-line
    }
}