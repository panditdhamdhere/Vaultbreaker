// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Testnet-only exact-transfer ERC-20 for Vaultbreaker integration rehearsal.
/// @dev Anyone may claim 100 tokens once. This token has no monetary value.
contract TestToken {
    string public constant name = "Vaultbreaker Test Token";
    string public constant symbol = "VTEST";
    uint8 public constant decimals = 6;
    uint256 public constant FAUCET_AMOUNT = 100 * 1e6;
    uint256 public totalSupply;
    address public immutable owner;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(address => bool) public faucetClaimed;

    event Transfer(address indexed from, address indexed to, uint256 amount);
    event Approval(address indexed account, address indexed spender, uint256 amount);

    constructor() {
        require(block.chainid == 46630, "testnet only");
        owner = msg.sender;
        _mint(msg.sender, 1_000_000 * 1e6);
    }

    function claimFaucet() external {
        require(!faucetClaimed[msg.sender], "already claimed");
        faucetClaimed[msg.sender] = true;
        _mint(msg.sender, FAUCET_AMOUNT);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "allowance");
        if (allowed != type(uint256).max) allowance[from][msg.sender] = allowed - amount;
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) private {
        require(to != address(0), "zero recipient");
        require(balanceOf[from] >= amount, "balance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }

    function _mint(address to, uint256 amount) private {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }
}
