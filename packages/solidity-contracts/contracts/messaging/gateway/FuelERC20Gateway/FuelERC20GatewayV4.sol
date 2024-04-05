// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.9;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import {IERC20MetadataUpgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/IERC20MetadataUpgradeable.sol";
import {SafeERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import {FuelERC20GatewayV3} from "../v3/FuelERC20GatewayV3.sol";
import {CommonPredicates} from "../../../lib/CommonPredicates.sol";
import {FuelMessagePortal} from "../../../fuelchain/FuelMessagePortal.sol";
import {FuelBridgeBase} from "../FuelBridgeBase.sol";
import {FuelMessagesEnabledUpgradeable} from "../../FuelMessagesEnabledUpgradeable.sol";

/// @title FuelERC20GatewayV4
/// @notice The L1 side of the general ERC20 gateway with Fuel. Not backwards compatible with previous implementations
contract FuelERC20GatewayV4 is
    Initializable,
    FuelBridgeBase,
    FuelMessagesEnabledUpgradeable,
    PausableUpgradeable,
    AccessControlUpgradeable,
    UUPSUpgradeable
{
    using SafeERC20Upgradeable for IERC20MetadataUpgradeable;

    ////////////
    // Types  //
    ////////////
    error BridgeFull();
    error GlobalDepositLimit();
    error CannotDepositZero();
    error CannotWithdrawZero();
    error InvalidSender();
    error InvalidAmount();

    /// @dev Emitted when tokens are deposited from Ethereum to Fuel
    event Deposit(bytes32 indexed sender, address indexed tokenAddress, uint256 amount);

    /// @dev Emitted when tokens are withdrawn from Fuel to Ethereum
    event Withdrawal(bytes32 indexed recipient, address indexed tokenAddress, uint256 amount);

    enum MessageType {
        DEPOSIT_TO_ADDRESS,
        DEPOSIT_TO_CONTRACT,
        DEPOSIT_WITH_DATA,
        METADATA
    }

    ///////////////
    // Constants //
    ///////////////

    /// @dev The admin related contract roles
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    uint256 public constant FUEL_ASSET_DECIMALS = 9;
    uint256 constant NO_DECIMALS = type(uint256).max;

    /////////////
    // Storage //
    /////////////

    bool public whitelistRequired;
    bytes32 public assetIssuerId;

    mapping(address => uint256) internal _deposits;
    mapping(address => uint256) internal _depositLimits;
    mapping(address => uint256) internal _decimalsCache;
    mapping(bytes32 => bool) internal _isBridge;

    /// @notice Contract initializer to setup starting values
    /// @param fuelMessagePortal The FuelMessagePortal contract
    function initialize(FuelMessagePortal fuelMessagePortal) public initializer {
        __FuelMessagesEnabled_init(fuelMessagePortal);
        __Pausable_init();
        __AccessControl_init();
        __UUPSUpgradeable_init();

        //grant initial roles
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(PAUSER_ROLE, msg.sender);
    }

    /////////////////////
    // Admin Functions //
    /////////////////////

    /// @notice Pause ERC20 transfers
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /// @notice Unpause ERC20 transfers
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /// @notice sets the entity on L2 that will mint the tokens
    function setAssetIssuerId(bytes32 id) external payable virtual onlyRole(DEFAULT_ADMIN_ROLE) {
        assetIssuerId = id;
    }

    /// @notice if enabled, only deposits for tokens allowed through `setGlobalDepositLimit` will be allowed
    function requireWhitelist(bool value) external onlyRole(DEFAULT_ADMIN_ROLE) {
        whitelistRequired = value;
    }

    /// @notice see `requireWhitelist`
    /// @dev param `limit` must be down/up scaled according to _adjustDepositDecimals
    function setGlobalDepositLimit(address token, uint256 limit) external payable virtual onlyRole(DEFAULT_ADMIN_ROLE) {
        _depositLimits[token] = limit;
    }

    /// @notice Allows the admin to rescue ETH sent to this contract by accident
    /// @dev Made payable to reduce gas costs
    function rescueETH() external payable virtual onlyRole(DEFAULT_ADMIN_ROLE) {
        (bool success, ) = address(msg.sender).call{value: address(this).balance}("");
        require(success);
    }

    //////////////////////
    // Public Functions //
    //////////////////////

    /// @notice Gets the amount of tokens deposited to a corresponding token on Fuel
    /// @param tokenAddress ERC-20 token address
    /// @return amount of tokens deposited
    function tokensDeposited(address tokenAddress) public view virtual returns (uint256) {
        return _deposits[tokenAddress];
    }

    /// @notice Gets the amount of tokens deposited to a corresponding token on Fuel
    /// @param tokenAddress ERC-20 token address
    /// @return amount of tokens deposited
    function depositLimits(address tokenAddress) public view virtual returns (uint256) {
        return _deposits[tokenAddress];
    }

    /// @notice Deposits the given tokens to an account on Fuel
    /// @param to Fuel address to deposit tokens to
    /// @param tokenAddress Address of the token being transferred to Fuel
    /// @param amount Amount of tokens to deposit
    /// @dev Made payable to reduce gas costs
    function deposit(bytes32 to, address tokenAddress, uint256 amount) external payable virtual whenNotPaused {
        uint8 decimals = _getTokenDecimals(tokenAddress);
        uint256 l2MintedAmount = _adjustDepositDecimals(decimals, amount);

        bytes memory depositMessage = abi.encodePacked(
            assetIssuerId,
            uint256(MessageType.DEPOSIT_TO_ADDRESS),
            bytes32(uint256(uint160(tokenAddress))),
            bytes32(0),
            bytes32(uint256(uint160(msg.sender))),
            to,
            l2MintedAmount,
            uint256(decimals)
        );
        _deposit(tokenAddress, amount, l2MintedAmount, depositMessage);
    }

    /// @notice Deposits the given tokens to a contract on Fuel with optional data
    /// @param to Fuel account or contract to deposit tokens to
    /// @param tokenAddress Address of the token being transferred to Fuel
    /// @param amount Amount of tokens to deposit
    /// @param data Optional data to send with the deposit
    /// @dev Made payable to reduce gas costs
    function depositWithData(
        bytes32 to,
        address tokenAddress,
        uint256 amount,
        bytes calldata data
    ) external payable virtual whenNotPaused {
        uint8 decimals = _getTokenDecimals(tokenAddress);
        uint256 l2MintedAmount = _adjustDepositDecimals(decimals, amount);

        bytes memory depositMessage = abi.encodePacked(
            assetIssuerId,
            data.length == 0 ? MessageType.DEPOSIT_TO_CONTRACT : MessageType.DEPOSIT_WITH_DATA,
            bytes32(uint256(uint160(tokenAddress))),
            bytes32(0),
            bytes32(uint256(uint160(msg.sender))),
            to,
            l2MintedAmount,
            decimals,
            data
        );
        _deposit(tokenAddress, amount, l2MintedAmount, depositMessage);
    }

    function sendMetadata(address tokenAddress) external payable virtual whenNotPaused {
        bytes memory metadataMessage = abi.encodePacked(
            assetIssuerId,
            MessageType.METADATA,
            abi.encode(
                tokenAddress,
                uint256(0), // token_id = 0 for all erc20 deposits
                IERC20MetadataUpgradeable(tokenAddress).symbol(),
                IERC20MetadataUpgradeable(tokenAddress).name()
            )
        );
        sendMessage(CommonPredicates.CONTRACT_MESSAGE_PREDICATE, metadataMessage);
    }

    /// @notice Finalizes the withdrawal process from the Fuel side gateway contract
    /// @param to Account to send withdrawn tokens to
    /// @param tokenAddress Address of the token being withdrawn from Fuel
    /// @param l2BurntAmount Amount of tokens to withdraw
    /// @dev Made payable to reduce gas costs
    function finalizeWithdrawal(
        address to,
        address tokenAddress,
        uint256 l2BurntAmount,
        uint256
    ) external payable virtual override whenNotPaused onlyFromPortal {
        if (l2BurntAmount == 0) {
            revert CannotWithdrawZero();
        }

        if (messageSender() != assetIssuerId) {
            revert InvalidSender();
        }

        uint8 decimals = _getTokenDecimals(tokenAddress);
        uint256 amount = _adjustWithdrawalDecimals(decimals, l2BurntAmount);

        //reduce deposit balance and transfer tokens (math will underflow if amount is larger than allowed)
        _deposits[tokenAddress] = _deposits[tokenAddress] - l2BurntAmount;
        IERC20MetadataUpgradeable(tokenAddress).safeTransfer(to, amount);

        //emit event for successful token withdraw
        emit Withdrawal(bytes32(uint256(uint160(to))), tokenAddress, amount);
    }

    /// @notice Deposits the given tokens to an account or contract on Fuel
    /// @param tokenAddress Address of the token being transferred to Fuel
    /// @param amount tokens that have been deposited
    /// @param l2MintedAmount tokens that will be minted on L2
    /// @param messageData The data of the message to send for deposit
    function _deposit(
        address tokenAddress,
        uint256 amount,
        uint256 l2MintedAmount,
        bytes memory messageData
    ) internal virtual {
        ////////////
        // Checks //
        ////////////
        if (l2MintedAmount == 0) revert CannotDepositZero();
        if (l2MintedAmount > uint256(type(uint64).max)) revert CannotDepositZero();

        /////////////
        // Effects //
        /////////////
        uint256 updatedDeposits = _deposits[tokenAddress] + l2MintedAmount;
        if (updatedDeposits > type(uint64).max) revert BridgeFull();

        if (whitelistRequired && updatedDeposits > _depositLimits[tokenAddress]) {
            revert GlobalDepositLimit();
        }

        _deposits[tokenAddress] = updatedDeposits;

        /////////////
        // Actions //
        /////////////
        //send message to gateway on Fuel to finalize the deposit
        sendMessage(CommonPredicates.CONTRACT_MESSAGE_PREDICATE, messageData);

        //transfer tokens to this contract and update deposit balance
        IERC20MetadataUpgradeable(tokenAddress).safeTransferFrom(msg.sender, address(this), amount);

        //emit event for successful token deposit
        emit Deposit(bytes32(uint256(uint160(msg.sender))), tokenAddress, amount);
    }

    function _getTokenDecimals(address tokenAddress) internal virtual returns (uint8) {
        uint256 decimals = _decimalsCache[tokenAddress];

        if (decimals == 0) {
            try IERC20MetadataUpgradeable(tokenAddress).decimals() returns (uint8 returnedDecimals) {
                _decimalsCache[tokenAddress] = returnedDecimals == 0 ? NO_DECIMALS : returnedDecimals;
                return returnedDecimals;
            } catch {
                _decimalsCache[tokenAddress] == NO_DECIMALS;
                return 0;
            }
        }

        if (decimals == NO_DECIMALS) return 0;
        return uint8(decimals);
    }

    function _adjustDepositDecimals(uint8 tokenDecimals, uint256 amount) internal pure virtual returns (uint256) {
        // Most common case: less than 9 decimals (USDT, USDC, WBTC)
        if (tokenDecimals < 9) {
            return amount * (10 ** (9 - tokenDecimals));
        }

        // Next common case: 18 decimals (most ERC20s)
        unchecked {
            if (tokenDecimals > 9) {
                uint256 precision = 10 ** (tokenDecimals - 9);
                if (amount % precision != 0) {
                    revert InvalidAmount();
                }
                return _divByNonZero(amount, precision);
            }
        }

        // Less common case: 9 decimals
        return amount;
    }

    function _adjustWithdrawalDecimals(uint8 tokenDecimals, uint256 amount) internal pure virtual returns (uint256) {
        unchecked {
            if (tokenDecimals < 9) {
                // Subject to precision losses (dust) in L2
                // Economic losses due to this are estimated to be less
                // than other evaluated alternatives, such as:
                // -    bouncing the deposit back to L2. E.g., in order to lose in the order of 0.01 USD
                //      BTC price should be sitting at 500k USDBTC
                // -    storing decimals in L2
                return _divByNonZero(amount, 10 ** (9 - tokenDecimals));
            }
        }

        if (tokenDecimals > 9) {
            uint256 precision = 10 ** (tokenDecimals - 9);
            return amount * precision;
        }

        return amount;
    }

    /// @dev gas efficient division. Must be used with care, `_div` must be non zero
    function _divByNonZero(uint256 _num, uint256 _div) internal pure returns (uint256 result) {
        assembly {
            result := div(_num, _div)
        }
    }

    /// @notice Executes a message in the given header
    // solhint-disable-next-line no-empty-blocks
    function _authorizeUpgrade(address newImplementation) internal override onlyRole(DEFAULT_ADMIN_ROLE) {
        //should revert if msg.sender is not authorized to upgrade the contract (currently only owner)
    }

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[49] private __gap;
}
