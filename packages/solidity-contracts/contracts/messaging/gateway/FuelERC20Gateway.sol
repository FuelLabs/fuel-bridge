// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import {SafeERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import {FuelMessagePortal, CommonPredicates} from "../../fuelchain/FuelMessagePortal.sol";
import {FuelMessagesEnabledUpgradeable} from "../FuelMessagesEnabledUpgradeable.sol";

/// @title FuelERC20Gateway
/// @notice The L1 side of the general ERC20 gateway with Fuel
/// @dev This contract can be used as a template for future gateways to Fuel
contract FuelERC20Gateway is
    Initializable,
    FuelMessagesEnabledUpgradeable,
    PausableUpgradeable,
    AccessControlUpgradeable,
    UUPSUpgradeable
{
    using SafeERC20Upgradeable for IERC20Upgradeable;

    ////////////
    // Events //
    ////////////

    /// @dev Emitted when tokens are deposited from Ethereum to Fuel
    event Deposit(bytes32 indexed sender, address indexed tokenId, bytes32 fuelTokenId, uint256 amount);

    /// @dev Emitted when tokens are withdrawn from Fuel to Ethereum
    event Withdrawal(bytes32 indexed recipient, address indexed tokenId, bytes32 fuelTokenId, uint256 amount);

    ///////////////
    // Constants //
    ///////////////

    /// @dev The admin related contract roles
    bytes1 public constant DEPOSIT_TO_CONTRACT = bytes1(keccak256("DEPOSIT_TO_CONTRACT"));

    /// @dev The admin related contract roles
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    /////////////
    // Storage //
    /////////////

    /// @notice Maps ERC20 tokens to Fuel tokens to balance of the ERC20 tokens deposited
    mapping(address => mapping(bytes32 => uint256)) private _deposits;

    /////////////////////////////
    // Constructor/Initializer //
    /////////////////////////////

    /// @notice Constructor disables initialization for the implementation contract
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

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

    //////////////////////
    // Public Functions //
    //////////////////////

    /// @notice Gets the amount of tokens deposited to a corresponding token on Fuel
    /// @param tokenAddress ERC-20 token address
    /// @param fuelTokenId ID of the corresponding token on Fuel
    /// @return amount of tokens deposited
    function tokensDeposited(address tokenAddress, bytes32 fuelTokenId) public view returns (uint256) {
        return _deposits[tokenAddress][fuelTokenId];
    }

    /// @notice Deposits the given tokens to an account on Fuel
    /// @param to Fuel account to deposit tokens to
    /// @param tokenId ID of the token being transferred to Fuel
    /// @param fuelTokenId ID of the token on Fuel that represent the deposited tokens
    /// @param amount Amount of tokens to deposit
    /// @dev Made payable to reduce gas costs
    function deposit(bytes32 to, address tokenId, bytes32 fuelTokenId, uint256 amount) external payable whenNotPaused {
        bytes memory messageData = abi.encodePacked(
            fuelTokenId,
            bytes32(uint256(uint160(tokenId))),
            bytes32(uint256(uint160(msg.sender))), //from
            to,
            bytes32(amount)
        );
        _deposit(tokenId, fuelTokenId, amount, messageData);
    }

    /// @notice Deposits the given tokens to a contract on Fuel with optional data
    /// @param to Fuel account or contract to deposit tokens to
    /// @param tokenId ID of the token being transferred to Fuel
    /// @param fuelTokenId ID of the token on Fuel that represent the deposited tokens
    /// @param amount Amount of tokens to deposit
    /// @param data Optional data to send with the deposit
    /// @dev Made payable to reduce gas costs
    function depositWithData(
        bytes32 to,
        address tokenId,
        bytes32 fuelTokenId,
        uint256 amount,
        bytes memory data
    ) external payable whenNotPaused {
        if (data.length == 0) {
            bytes memory messageData = abi.encodePacked(
                fuelTokenId,
                bytes32(uint256(uint160(tokenId))),
                bytes32(uint256(uint160(msg.sender))), //from
                to,
                bytes32(amount),
                DEPOSIT_TO_CONTRACT
            );
            _deposit(tokenId, fuelTokenId, amount, messageData);
        } else {
            bytes memory messageData = abi.encodePacked(
                fuelTokenId,
                bytes32(uint256(uint160(tokenId))),
                bytes32(uint256(uint160(msg.sender))), //from
                to,
                bytes32(amount),
                DEPOSIT_TO_CONTRACT,
                data
            );
            _deposit(tokenId, fuelTokenId, amount, messageData);
        }
    }

    /// @notice Finalizes the withdrawal process from the Fuel side gateway contract
    /// @param to Account to send withdrawn tokens to
    /// @param tokenId ID of the token being withdrawn from Fuel
    /// @param amount Amount of tokens to withdraw
    /// @dev Made payable to reduce gas costs
    function finalizeWithdrawal(
        address to,
        address tokenId,
        uint256 amount
    ) external payable whenNotPaused onlyFromPortal {
        require(amount > 0, "Cannot withdraw zero");
        bytes32 fuelTokenId = messageSender();

        //reduce deposit balance and transfer tokens (math will underflow if amount is larger than allowed)
        _deposits[tokenId][fuelTokenId] = _deposits[tokenId][fuelTokenId] - amount;
        IERC20Upgradeable(tokenId).safeTransfer(to, amount);

        //emit event for successful token withdraw
        emit Withdrawal(bytes32(uint256(uint160(to))), tokenId, fuelTokenId, amount);
    }

    /// @notice Allows the admin to rescue ETH sent to this contract by accident
    /// @dev Made payable to reduce gas costs
    function rescueETH() external payable onlyRole(DEFAULT_ADMIN_ROLE) {
        (bool success, ) = address(msg.sender).call{value: address(this).balance}("");
        require(success);
    }

    ////////////////////////
    // Internal Functions //
    ////////////////////////

    /// @notice Deposits the given tokens to an account or contract on Fuel
    /// @param tokenId ID of the token being transferred to Fuel
    /// @param fuelTokenId ID of the token on Fuel that represent the deposited tokens
    /// @param amount Amount of tokens to deposit
    /// @param messageData The data of the message to send for deposit
    function _deposit(address tokenId, bytes32 fuelTokenId, uint256 amount, bytes memory messageData) private {
        require(amount > 0, "Cannot deposit zero");

        //transfer tokens to this contract and update deposit balance
        IERC20Upgradeable(tokenId).safeTransferFrom(msg.sender, address(this), amount);
        _deposits[tokenId][fuelTokenId] = _deposits[tokenId][fuelTokenId] + amount;

        //send message to gateway on Fuel to finalize the deposit
        sendMessage(CommonPredicates.CONTRACT_MESSAGE_PREDICATE, messageData);

        //emit event for successful token deposit
        emit Deposit(bytes32(uint256(uint160(msg.sender))), tokenId, fuelTokenId, amount);
    }

    /// @notice Executes a message in the given header
    // solhint-disable-next-line no-empty-blocks
    function _authorizeUpgrade(address newImplementation) internal override onlyRole(DEFAULT_ADMIN_ROLE) {
        //should revert if msg.sender is not authorized to upgrade the contract (currently only owner)
    }
}
