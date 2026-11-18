// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IGameToken {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
}

interface IGameRegistry {
    function firstRoundAfter(uint256 timestamp) external pure returns (uint64);
    function roundTime(uint64 round) external pure returns (uint64);
    function hasSig(uint64 round) external view returns (bool);
    function randomnessOf(uint64 round) external view returns (bytes32);
    function postSig(uint64 round, bytes calldata signature) external returns (bool);
}

interface IGameRouter {
    function addRewards(address asset, uint256 amount) external;
}

/// @notice Escrowed testnet game. A separate funded reserve backs the maximum payout of every live run.
contract Vaultbreaker {
    error InvalidChoice();
    error InvalidState();
    error InsufficientReserve();
    error NotOwner();
    error TransferFailed();
    error ReentrantCall();
    error InvalidRound();
    error Paused();

    struct Run {
        address player;
        uint64 round;
        uint8 stage;
        uint8 choice;
        uint128 credits;
        bool active;
        bool awaiting;
    }

    IGameToken public immutable token;
    IGameRegistry public immutable registry;
    IGameRouter public immutable router;
    address public immutable owner;
    uint256 public immutable entryAmount;
    uint256 public immutable maximumPayout;
    uint256 public reserved;
    uint256 public nextRunId = 1;
    bool public paused;
    mapping(uint256 => Run) public runs;
    bool private entered;

    uint256 public constant ROUTER_FEE_BPS = 1_000;
    uint256 public constant BPS = 10_000;
    uint8 public constant FINAL_STAGE = 6;
    uint256 public constant ROUND_DELAY = 30;

    event RunStarted(uint256 indexed runId, address indexed player, uint64 round, uint8 choice);
    event StageStarted(uint256 indexed runId, uint8 stage, uint64 round, uint8 choice);
    event StageResolved(uint256 indexed runId, uint8 stage, uint8 outcome, uint256 credits);
    event CashedOut(uint256 indexed runId, address indexed player, uint256 payout);
    event ReserveFunded(address indexed source, uint256 amount);
    event SurplusWithdrawn(address indexed to, uint256 amount);
    event PauseSet(bool paused);

    modifier nonReentrant() {
        if (entered) revert ReentrantCall();
        entered = true;
        _;
        entered = false;
    }

    constructor(address token_, address registry_, address router_, address owner_, uint256 entryAmount_) {
        require(block.chainid == 46630, "testnet only");
        require(token_ != address(0) && registry_ != address(0) && router_ != address(0) && owner_ != address(0));
        require(entryAmount_ >= 10 && entryAmount_ <= type(uint128).max / 12);
        token = IGameToken(token_);
        registry = IGameRegistry(registry_);
        router = IGameRouter(router_);
        owner = owner_;
        entryAmount = entryAmount_;
        // 1.5^6 = 11.390625. Repeated integer division can only round down.
        maximumPayout = entryAmount_ * 11_390_625 / 1_000_000;
    }

    function fund(uint256 amount) external nonReentrant {
        _pull(msg.sender, amount);
        emit ReserveFunded(msg.sender, amount);
    }

    /// @notice Stop new entries without blocking settlement or existing players' cash-outs.
    function setPaused(bool value) external {
        if (msg.sender != owner) revert NotOwner();
        paused = value;
        emit PauseSet(value);
    }

    function start(uint8 choice) external nonReentrant returns (uint256 runId) {
        if (paused) revert Paused();
        if (choice >= 3) revert InvalidChoice();
        _pull(msg.sender, entryAmount);
        uint256 fee = entryAmount * ROUTER_FEE_BPS / BPS;
        uint256 beforeFee = token.balanceOf(address(this));
        if (!token.approve(address(router), fee)) revert TransferFailed();
        router.addRewards(address(token), fee);
        if (token.balanceOf(address(this)) != beforeFee - fee) revert TransferFailed();
        uint64 round = _futureRound();
        uint256 newReserved = reserved + maximumPayout;
        if (token.balanceOf(address(this)) < newReserved) revert InsufficientReserve();
        reserved = newReserved;
        runId = nextRunId++;
        runs[runId] = Run(msg.sender, round, 1, choice, uint128(entryAmount), true, true);
        emit RunStarted(runId, msg.sender, round, choice);
    }

    function advance(uint256 runId, uint8 choice) external nonReentrant {
        if (choice >= 3) revert InvalidChoice();
        Run storage run = runs[runId];
        if (run.player != msg.sender) revert NotOwner();
        if (!run.active || run.awaiting || run.stage >= FINAL_STAGE) revert InvalidState();
        run.stage++;
        run.choice = choice;
        run.round = _futureRound();
        run.awaiting = true;
        emit StageStarted(runId, run.stage, run.round, choice);
    }

    /// @notice Anyone may post the chosen beacon and settle the locked choice.
    /// outcome: 0 trap, 1 cache, 2 relic.
    function resolve(uint256 runId, bytes calldata signature) external nonReentrant returns (uint8 outcome) {
        Run storage run = runs[runId];
        if (!run.active || !run.awaiting) revert InvalidState();
        if (block.timestamp < registry.roundTime(run.round)) revert InvalidRound();
        if (!registry.hasSig(run.round)) registry.postSig(run.round, signature);
        if (!registry.hasSig(run.round)) revert InvalidRound();
        bytes32 seed = keccak256(abi.encode(registry.randomnessOf(run.round), runId, run.stage));
        uint8 trap = uint8(uint256(seed) % 3);
        uint8 relic = uint8((trap + 1 + ((uint256(seed) >> 8) % 2)) % 3);
        if (run.choice == trap) {
            run.active = false;
            run.awaiting = false;
            run.credits = 0;
            reserved -= maximumPayout;
            outcome = 0;
        } else {
            outcome = run.choice == relic ? 2 : 1;
            run.credits = uint128(uint256(run.credits) * (outcome == 2 ? 15_000 : 11_000) / BPS);
            run.awaiting = false;
        }
        emit StageResolved(runId, run.stage, outcome, run.credits);
    }

    function cashOut(uint256 runId) external nonReentrant {
        Run storage run = runs[runId];
        if (run.player != msg.sender) revert NotOwner();
        if (!run.active || run.awaiting) revert InvalidState();
        uint256 payout = run.credits;
        run.active = false;
        run.credits = 0;
        reserved -= maximumPayout;
        if (!token.transfer(msg.sender, payout)) revert TransferFailed();
        emit CashedOut(runId, msg.sender, payout);
    }

    /// @notice Owner can remove only balance above worst-case live-run liabilities.
    function withdrawSurplus(address to, uint256 amount) external nonReentrant {
        if (msg.sender != owner) revert NotOwner();
        if (to == address(0) || token.balanceOf(address(this)) < reserved + amount) revert InsufficientReserve();
        if (!token.transfer(to, amount)) revert TransferFailed();
        emit SurplusWithdrawn(to, amount);
    }

    function _futureRound() private view returns (uint64 round) {
        round = registry.firstRoundAfter(block.timestamp + ROUND_DELAY);
        if (registry.roundTime(round) <= block.timestamp + ROUND_DELAY) revert InvalidRound();
    }

    function _pull(address from, uint256 amount) private {
        uint256 beforeBalance = token.balanceOf(address(this));
        if (!token.transferFrom(from, address(this), amount)) revert TransferFailed();
        if (token.balanceOf(address(this)) != beforeBalance + amount) revert TransferFailed();
    }
}
