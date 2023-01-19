// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import {SafeERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import {IFuelMessagePortal, InputMessagePredicates} from "../IFuelMessagePortal.sol";
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

    ///////////////
    // Constants //
    ///////////////

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
    /// @param fuelMessagePortal The IfuelMessagePortal contract
    function initialize(IFuelMessagePortal fuelMessagePortal) public initializer {
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

    /// @notice Deposits the given tokens to an address on Fuel
    /// @param to Fuel account or contract to deposit tokens to
    /// @param tokenId ID of the token being transferred to Fuel
    /// @param fuelTokenId ID of the token on Fuel that represent the deposited tokens
    /// @param amount Amount of tokens to deposit
    /// @dev Made payable to reduce gas costs
    function deposit(bytes32 to, address tokenId, bytes32 fuelTokenId, uint256 amount) external payable whenNotPaused {
        require(amount > 0, "Cannot deposit zero");

        //transfer tokens to this contract and update deposit balance
        IERC20Upgradeable(tokenId).safeTransferFrom(msg.sender, address(this), amount);
        _deposits[tokenId][fuelTokenId] = _deposits[tokenId][fuelTokenId] + amount;

        //send message to gateway on Fuel to finalize the deposit
        bytes memory data = abi.encodePacked(
            fuelTokenId,
            bytes32(uint256(uint160(tokenId))),
            bytes32(uint256(uint160(msg.sender))), //from
            to,
            bytes32(amount)
        );
        sendMessage(InputMessagePredicates.CONTRACT_MESSAGE_PREDICATE, data);
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
    }

    ////////////////////////
    // Internal Functions //
    ////////////////////////

    /// @notice Executes a message in the given header
    // solhint-disable-next-line no-empty-blocks
    function _authorizeUpgrade(address newImplementation) internal override onlyRole(DEFAULT_ADMIN_ROLE) {
        //should revert if msg.sender is not authorized to upgrade the contract (currently only owner)
    }
}
