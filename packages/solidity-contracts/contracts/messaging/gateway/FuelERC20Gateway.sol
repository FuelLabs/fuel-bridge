// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import {SafeERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import {FuelBridgeBase} from "./FuelBridgeBase.sol";
import {FuelMessagePortal, CommonPredicates} from "../../fuelchain/FuelMessagePortal.sol";
import {FuelMessagesEnabledUpgradeable} from "../FuelMessagesEnabledUpgradeable.sol";

/// @title FuelERC20Gateway
/// @notice The L1 side of the general ERC20 gateway with Fuel
/// @dev This contract can be used as a template for future gateways to Fuel
contract FuelERC20Gateway is
    Initializable,
    FuelBridgeBase,
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
    event Deposit(bytes32 indexed sender, address indexed tokenAddress, bytes32 indexed fuelContractId, uint256 amount);

    /// @dev Emitted when tokens are withdrawn from Fuel to Ethereum
    event Withdrawal(
        bytes32 indexed recipient,
        address indexed tokenAddress,
        bytes32 indexed fuelContractId,
        uint256 amount
    );

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
    /// @param fuelContractId ID of the corresponding token on Fuel
    /// @return amount of tokens deposited
    function tokensDeposited(address tokenAddress, bytes32 fuelContractId) public view returns (uint256) {
        return _deposits[tokenAddress][fuelContractId];
    }

    /// @notice Deposits the given tokens to an account on Fuel
    /// @param to Fuel address to deposit tokens to
    /// @param tokenAddress Address of the token being transferred to Fuel
    /// @param fuelContractId ID of the contract on Fuel that manages the deposited tokens
    /// @param amount Amount of tokens to deposit
    /// @dev Made payable to reduce gas costs
    function deposit(
        bytes32 to,
        address tokenAddress,
        bytes32 fuelContractId,
        uint256 amount
    ) external payable whenNotPaused {
        bytes memory messageData = abi.encodePacked(
            fuelContractId,
            bytes32(uint256(uint160(tokenAddress))), // OFFSET_TOKEN_ADDRESS = 32
            bytes32(0), // OFFSET_TOKEN_ID = 64
            bytes32(uint256(uint160(msg.sender))), //from, OFFSET_FROM = 96
            to, // OFFSET_TO = 128
            amount // OFFSET_AMOUNT = 160
        );
        _deposit(tokenAddress, fuelContractId, amount, messageData);
    }

    /// @notice Deposits the given tokens to a contract on Fuel with optional data
    /// @param to Fuel account or contract to deposit tokens to
    /// @param tokenAddress Address of the token being transferred to Fuel
    /// @param fuelContractId ID of the contract on Fuel that manages the deposited tokens
    /// @param amount Amount of tokens to deposit
    /// @param data Optional data to send with the deposit
    /// @dev Made payable to reduce gas costs
    function depositWithData(
        bytes32 to,
        address tokenAddress,
        bytes32 fuelContractId,
        uint256 amount,
        bytes calldata data
    ) external payable whenNotPaused {
        bytes memory messageData = abi.encodePacked(
                fuelContractId,
                bytes32(uint256(uint160(tokenAddress))), // OFFSET_TOKEN_ADDRESS = 32
                bytes32(0), // OFFSET_TOKEN_ID = 64
                bytes32(uint256(uint160(msg.sender))), //from, OFFSET_FROM = 96
                to, // OFFSET_TO = 128
                amount, // OFFSET_AMOUNT = 160
                DEPOSIT_TO_CONTRACT, // OFFSET_ROLE = 161
                data
            );
        _deposit(tokenAddress, fuelContractId, amount, messageData);
    }

    /// @notice Finalizes the withdrawal process from the Fuel side gateway contract
    /// @param to Account to send withdrawn tokens to
    /// @param tokenAddress Address of the token being withdrawn from Fuel
    /// @param amount Amount of tokens to withdraw
    /// @param tokenId Discriminator for ERC721 / ERC1155 tokens. For ERC20, it must be 0
    /// @dev Made payable to reduce gas costs
    function finalizeWithdrawal(
        address to,
        address tokenAddress,
        uint256 amount,
        uint256 tokenId
    ) external payable override whenNotPaused onlyFromPortal {
        require(amount > 0, "Cannot withdraw zero");
        require(tokenId == 0, "Fungible tokens cannot have a tokenId");
        bytes32 fuelContractId = messageSender();

        //reduce deposit balance and transfer tokens (math will underflow if amount is larger than allowed)
        _deposits[tokenAddress][fuelContractId] = _deposits[tokenAddress][fuelContractId] - amount;
        IERC20Upgradeable(tokenAddress).safeTransfer(to, amount);

        //emit event for successful token withdraw
        emit Withdrawal(bytes32(uint256(uint160(to))), tokenAddress, fuelContractId, amount);
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
    /// @param tokenAddress Address of the token being transferred to Fuel
    /// @param fuelContractId ID of the contract on Fuel that manages the deposited tokens
    /// @param amount Amount of tokens to deposit
    /// @param messageData The data of the message to send for deposit
    function _deposit(address tokenAddress, bytes32 fuelContractId, uint256 amount, bytes memory messageData) private {
        require(amount > 0, "Cannot deposit zero");

        //transfer tokens to this contract and update deposit balance
        IERC20Upgradeable(tokenAddress).safeTransferFrom(msg.sender, address(this), amount);
        _deposits[tokenAddress][fuelContractId] = _deposits[tokenAddress][fuelContractId] + amount;

        //send message to gateway on Fuel to finalize the deposit
        sendMessage(CommonPredicates.CONTRACT_MESSAGE_PREDICATE, messageData);

        //emit event for successful token deposit
        emit Deposit(bytes32(uint256(uint160(msg.sender))), tokenAddress, fuelContractId, amount);
    }

    /// @notice Executes a message in the given header
    // solhint-disable-next-line no-empty-blocks
    function _authorizeUpgrade(address newImplementation) internal override onlyRole(DEFAULT_ADMIN_ROLE) {
        //should revert if msg.sender is not authorized to upgrade the contract (currently only owner)
    }
}
