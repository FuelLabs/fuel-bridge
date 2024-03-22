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
        DEPOSIT,
        METADATA
    }

    ///////////////
    // Constants //
    ///////////////

    bytes1 public constant DEPOSIT_TO_CONTRACT = bytes1(keccak256("DEPOSIT_TO_CONTRACT"));

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

        bytes memory messageData = abi.encodePacked(
            MessageType.DEPOSIT,
            assetIssuerId,
            bytes32(uint256(uint160(tokenAddress))),
            bytes32(0),
            bytes32(uint256(uint160(msg.sender))),
            to,
            amount,
            decimals
        );
        _deposit(tokenAddress, amount, messageData);
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

        bytes memory messageData = abi.encodePacked(
            MessageType.DEPOSIT,
            assetIssuerId,
            bytes32(uint256(uint160(tokenAddress))),
            bytes32(0),
            bytes32(uint256(uint160(msg.sender))),
            to,
            amount,
            decimals,
            DEPOSIT_TO_CONTRACT,
            data
        );
        _deposit(tokenAddress, amount, messageData);
    }

    function sendMetadata(address tokenAddress) external payable virtual whenNotPaused {
        bytes memory messageData = abi.encodePacked(
            MessageType.METADATA,
            abi.encode(IERC20MetadataUpgradeable(tokenAddress).symbol(), IERC20MetadataUpgradeable(tokenAddress).name())
        );
        sendMessage(CommonPredicates.CONTRACT_MESSAGE_PREDICATE, messageData);
    }

    /// @notice Deposits the given tokens to an account or contract on Fuel
    /// @param tokenAddress Address of the token being transferred to Fuel
    /// @param amount Amount of tokens to deposit
    /// @param messageData The data of the message to send for deposit
    function _deposit(address tokenAddress, uint256 amount, bytes memory messageData) internal virtual {
        ////////////
        // Checks //
        ////////////
        if (amount == 0) revert CannotDepositZero();
        if (amount > uint256(type(uint64).max)) revert CannotDepositZero();

        /////////////
        // Effects //
        /////////////
        uint256 updatedDeposits = _deposits[tokenAddress] + amount;
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

    /// @notice Finalizes the withdrawal process from the Fuel side gateway contract
    /// @param to Account to send withdrawn tokens to
    /// @param tokenAddress Address of the token being withdrawn from Fuel
    /// @param amount Amount of tokens to withdraw
    /// @dev Made payable to reduce gas costs
    function finalizeWithdrawal(
        address to,
        address tokenAddress,
        uint256 amount,
        uint256
    ) external payable virtual override whenNotPaused onlyFromPortal {
        if (amount == 0) {
            revert CannotWithdrawZero();
        }

        if (messageSender() != assetIssuerId) {
            revert InvalidSender();
        }

        //reduce deposit balance and transfer tokens (math will underflow if amount is larger than allowed)
        _deposits[tokenAddress] = _deposits[tokenAddress] - amount;
        IERC20MetadataUpgradeable(tokenAddress).safeTransfer(to, amount);

        //emit event for successful token withdraw
        emit Withdrawal(bytes32(uint256(uint160(to))), tokenAddress, amount);
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

    function _adjustDecimals(uint8 tokenDecimals, uint256 amount) internal virtual returns (uint256) {
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
                return divByNonZero(amount, precision);
            }
        }

        // Less common case: 9 decimals
        return amount;
    }

    function divByNonZero(uint256 _num, uint256 _div) internal pure returns (uint256 result) {
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
