// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import {IERC721Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import {FuelBridgeBase} from "./FuelBridgeBase.sol";
import {FuelMessagePortal, CommonPredicates} from "../../fuelchain/FuelMessagePortal.sol";
import {FuelMessagesEnabledUpgradeable} from "../FuelMessagesEnabledUpgradeable.sol";

import "hardhat/console.sol";

/// @title FuelERC721Gateway
/// @notice The L1 side of the general ERC721 gateway with Fuel
/// @dev This contract can be used as a template for future gateways to Fuel
contract FuelERC721Gateway is
    Initializable,
    FuelBridgeBase,
    FuelMessagesEnabledUpgradeable,
    PausableUpgradeable,
    AccessControlUpgradeable,
    UUPSUpgradeable
{
    ////////////
    // Events //
    ////////////

    /// @dev Emitted when tokens are deposited from Ethereum to Fuel
    event Deposit(bytes32 indexed sender, address indexed tokenAddress, bytes32 fuelContractId, uint256 tokenId);

    /// @dev Emitted when tokens are withdrawn from Fuel to Ethereum
    event Withdrawal(bytes32 indexed recipient, address indexed tokenAddress, bytes32 fuelContractId, uint256 tokenId);

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

    /// @notice Maps ERC721 tokens to its fuel bridge counterpart
    mapping(address => mapping(uint256 => bytes32)) private _deposits;

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

    /// @notice Pause ERC721 transfers
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /// @notice Unpause ERC721 transfers
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    //////////////////////
    // Public Functions //
    //////////////////////

    /// @notice Gets the FuelContractId of an ERC-721 token
    /// @param tokenAddress ERC-721 token address
    /// @param tokenId tokenId
    /// @return fuelContractId ID of the Fuel contract
    function tokensDeposited(address tokenAddress, uint256 tokenId) public view returns (bytes32) {
        return _deposits[tokenAddress][tokenId];
    }

    /// @notice Deposits the given tokens to an account on Fuel
    /// @param to Fuel account to deposit tokens to
    /// @param tokenAddress Address of the token being transferred to Fuel
    /// @param fuelContractId ID of the contract on Fuel that manages the deposited tokens
    /// @param tokenId tokenId to deposit
    /// @dev Made payable to reduce gas costs
    function deposit(
        bytes32 to,
        address tokenAddress,
        bytes32 fuelContractId,
        uint256 tokenId
    ) external payable whenNotPaused {
        bytes memory messageData = abi.encodePacked(
            fuelContractId,
            bytes32(uint256(uint160(tokenAddress))), // OFFSET_TOKEN_ADDRESS = 32
            tokenId,
            bytes32(uint256(uint160(msg.sender))), //from, OFFSET_FROM = 96
            to, // OFFSET_TO = 128
            uint256(1) // OFFSET_AMOUNT = 160
        );
        _deposit(tokenAddress, fuelContractId, tokenId, messageData);
    }

    /// @notice Deposits the given tokens to a contract on Fuel with optional data
    /// @param to Fuel account or contract to deposit tokens to
    /// @param tokenAddress Address of the token being transferred to Fuel
    /// @param fuelContractId ID of the contract on Fuel that manages the deposited tokens
    /// @param tokenId tokenId to deposit
    /// @param data Optional data to send with the deposit
    /// @dev Made payable to reduce gas costs
    function depositWithData(
        bytes32 to,
        address tokenAddress,
        bytes32 fuelContractId,
        uint256 tokenId,
        bytes calldata data
    ) external payable whenNotPaused {
        bytes memory messageData = abi.encodePacked(
            fuelContractId,
            bytes32(uint256(uint160(tokenAddress))), // OFFSET_TOKEN_ADDRESS = 32
            tokenId, // OFFSET_TOKEN_ID = 64
            bytes32(uint256(uint160(msg.sender))), //from, OFFSET_FROM = 96
            to, // OFFSET_TO = 128
            uint256(1), // OFFSET_AMOUNT = 160
            DEPOSIT_TO_CONTRACT, // OFFSET_ROLE = 161
            data
        );
        _deposit(tokenAddress, fuelContractId, tokenId, messageData);
    }

    /// @notice Finalizes the withdrawal process from the Fuel side gateway contract
    /// @param to Account to send withdrawn tokens to
    /// @param tokenAddress Address of the token being withdrawn from Fuel
    /// @param tokenId Discriminator for ERC721 / ERC1155 tokens
    /// @dev Made payable to reduce gas costs.
    /// @dev Could remove the amount param to further reduce cost, but that implies changes in the Fuel contract
    function finalizeWithdrawal(
        address to,
        address tokenAddress,
        uint256 /*amount*/,
        uint256 tokenId
    ) external payable override whenNotPaused onlyFromPortal {
        bytes32 fuelContractId = messageSender();
        require(_deposits[tokenAddress][tokenId] == fuelContractId, "Fuel bridge does not own this token");

        delete _deposits[tokenAddress][tokenId];

        IERC721Upgradeable(tokenAddress).transferFrom(address(this), to, tokenId);
        //emit event for successful token withdraw
        emit Withdrawal(bytes32(uint256(uint160(to))), tokenAddress, fuelContractId, 1);
    }

    ////////////////////////
    // Internal Functions //
    ////////////////////////

    /// @notice Deposits the given tokens to an account or contract on Fuel
    /// @param tokenAddress Address of the token being transferred to Fuel
    /// @param fuelContractId ID of the contract on Fuel that manages the deposited tokens
    /// @param tokenId tokenId to deposit
    /// @param messageData The data of the message to send for deposit
    function _deposit(address tokenAddress, bytes32 fuelContractId, uint256 tokenId, bytes memory messageData) private {
        // TODO: this check might be unnecessary. If the token is conformant to ERC721
        // it should not be possible to deposit the same token again
        require(_deposits[tokenAddress][tokenId] == 0, "tokenId is already owned by another fuel bridge");
        _deposits[tokenAddress][tokenId] = fuelContractId;

        //send message to gateway on Fuel to finalize the deposit
        sendMessage(CommonPredicates.CONTRACT_MESSAGE_PREDICATE, messageData);

        IERC721Upgradeable(tokenAddress).transferFrom(msg.sender, address(this), tokenId);
        //emit event for successful token deposit
        emit Deposit(bytes32(uint256(uint160(msg.sender))), tokenAddress, fuelContractId, tokenId);
    }

    /// @notice Executes a message in the given header
    // solhint-disable-next-line no-empty-blocks
    function _authorizeUpgrade(address newImplementation) internal override onlyRole(DEFAULT_ADMIN_ROLE) {
        //should revert if msg.sender is not authorized to upgrade the contract (currently only owner)
    }
}
