// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "../contracts/Vaultbreaker.sol";

interface Vm {
    function warp(uint256 timestamp) external;
    function chainId(uint256 newChainId) external;
    function prank(address sender) external;
}

contract MockToken is IGameToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount);
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount && allowance[from][msg.sender] >= amount);
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract MockRegistry is IGameRegistry {
    mapping(uint64 => bytes32) public seeds;

    function firstRoundAfter(uint256 timestamp) external pure returns (uint64) {
        return uint64(timestamp / 3 + 1);
    }

    function roundTime(uint64 round) external pure returns (uint64) {
        return round * 3;
    }

    function hasSig(uint64 round) external view returns (bool) {
        return seeds[round] != bytes32(0);
    }

    function randomnessOf(uint64 round) external view returns (bytes32) {
        return seeds[round];
    }

    function postSig(uint64 round, bytes calldata signature) external returns (bool) {
        seeds[round] = abi.decode(signature, (bytes32));
        return true;
    }
}

contract MockRouter is IGameRouter {
    MockToken public immutable token;
    uint256 public totalAdded;

    constructor(MockToken token_) {
        token = token_;
    }

    function addRewards(address asset, uint256 amount) external {
        require(asset == address(token));
        token.transferFrom(msg.sender, address(this), amount);
        totalAdded += amount;
    }
}

contract VaultbreakerTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    MockToken token;
    MockRegistry registry;
    MockRouter router;
    Vaultbreaker game;
    uint256 constant ENTRY = 1e6;

    function setUp() public {
        vm.chainId(46630);
        token = new MockToken();
        registry = new MockRegistry();
        router = new MockRouter(token);
        game = new Vaultbreaker(address(token), address(registry), address(router), address(this), ENTRY);
        token.mint(address(this), 30e6);
        token.approve(address(game), type(uint256).max);
        game.fund(20e6);
    }

    function _seedFor(bool trap, uint256 runId, uint8 stage, uint8 choice) private pure returns (bytes32 result) {
        for (uint256 n = 1; n < 100; n++) {
            bytes32 candidate = bytes32(n);
            uint8 trapDoor = uint8(uint256(keccak256(abi.encode(candidate, runId, stage))) % 3);
            if ((trapDoor == choice) == trap) return candidate;
        }
        revert("seed not found");
    }

    function _relicSeed(uint256 runId, uint8 stage, uint8 choice) private pure returns (bytes32) {
        for (uint256 n = 1; n < 1000; n++) {
            bytes32 candidate = bytes32(n);
            bytes32 hash = keccak256(abi.encode(candidate, runId, stage));
            uint8 trapDoor = uint8(uint256(hash) % 3);
            uint8 relicDoor = uint8((trapDoor + 1 + ((uint256(hash) >> 8) % 2)) % 3);
            if (relicDoor == choice) return candidate;
        }
        revert("relic seed not found");
    }

    function _cacheSeed(uint256 runId, uint8 stage, uint8 choice) private pure returns (bytes32) {
        for (uint256 n = 1; n < 1000; n++) {
            bytes32 candidate = bytes32(n);
            bytes32 hash = keccak256(abi.encode(candidate, runId, stage));
            uint8 trapDoor = uint8(uint256(hash) % 3);
            uint8 relicDoor = uint8((trapDoor + 1 + ((uint256(hash) >> 8) % 2)) % 3);
            if (choice != trapDoor && choice != relicDoor) return candidate;
        }
        revert("cache seed not found");
    }

    function testCacheAndRelicPayExactClaims() public {
        uint256 before = token.balanceOf(address(this));
        uint256 cacheId = game.start(0);
        (, uint64 cacheRound,,,,,) = game.runs(cacheId);
        vm.warp(registry.roundTime(cacheRound));
        assert(game.resolve(cacheId, abi.encode(_cacheSeed(cacheId, 1, 0))) == 1);
        (,,,, uint128 cacheCredits,,) = game.runs(cacheId);
        assert(cacheCredits == 1_100_000);
        game.cashOut(cacheId);
        assert(token.balanceOf(address(this)) == before + 100_000);

        uint256 relicId = game.start(0);
        (, uint64 relicRound,,,,,) = game.runs(relicId);
        vm.warp(registry.roundTime(relicRound));
        assert(game.resolve(relicId, abi.encode(_relicSeed(relicId, 1, 0))) == 2);
        (,,,, uint128 relicCredits,,) = game.runs(relicId);
        assert(relicCredits == 1_500_000);
        game.cashOut(relicId);
        assert(token.balanceOf(address(this)) == before + 600_000);
        assert(router.totalAdded() == 200_000);
    }

    function testConcurrentRunsCannotExceedReserve() public {
        uint256 firstId = game.start(0);
        (bool second,) = address(game).call(abi.encodeWithSelector(game.start.selector, uint8(1)));
        assert(!second);
        assert(game.reserved() == game.maximumPayout());
        (, uint64 round,,,,,) = game.runs(firstId);
        vm.warp(registry.roundTime(round));
        game.resolve(firstId, abi.encode(_seedFor(true, firstId, 1, 0)));
        assert(game.reserved() == 0);
        assert(game.start(1) == firstId + 1);
    }

    function testPauseStopsNewEntriesButPreservesCashOut() public {
        uint256 id = game.start(0);
        game.setPaused(true);
        (bool newEntry,) = address(game).call(abi.encodeWithSelector(game.start.selector, uint8(1)));
        assert(!newEntry);
        (, uint64 round,,,,,) = game.runs(id);
        vm.warp(registry.roundTime(round));
        game.resolve(id, abi.encode(_cacheSeed(id, 1, 0)));
        game.cashOut(id);
        assert(game.reserved() == 0);
        game.setPaused(false);
        assert(game.start(1) == id + 1);
    }

    function testOnlyOwnerCanPause() public {
        vm.prank(address(0xBEEF));
        (bool ok,) = address(game).call(abi.encodeWithSelector(game.setPaused.selector, true));
        assert(!ok && !game.paused());
    }

    function testSafeRunRoutesFeeAndPaysClaim() public {
        uint256 before = token.balanceOf(address(this));
        uint256 id = game.start(0);
        assert(id == 1);
        assert(router.totalAdded() == ENTRY / 10);
        (, uint64 round,,,, bool active, bool awaiting) = game.runs(id);
        assert(active && awaiting && registry.roundTime(round) > block.timestamp + 30);
        vm.warp(registry.roundTime(round));
        uint8 outcome = game.resolve(id, abi.encode(_seedFor(false, id, 1, 0)));
        assert(outcome == 1 || outcome == 2);
        game.cashOut(id);
        assert(game.reserved() == 0);
        assert(token.balanceOf(address(this)) >= before - ENTRY);
    }

    function testTrapEndsRunAndReleasesReserve() public {
        uint256 id = game.start(0);
        (, uint64 round,,,,,) = game.runs(id);
        vm.warp(registry.roundTime(round));
        assert(game.resolve(id, abi.encode(_seedFor(true, id, 1, 0))) == 0);
        assert(game.reserved() == 0);
        (,,,, uint128 credits, bool active,) = game.runs(id);
        assert(!active && credits == 0);
    }

    function testCannotStartWithoutWorstCaseReserve() public {
        MockToken token2 = new MockToken();
        MockRouter router2 = new MockRouter(token2);
        Vaultbreaker empty =
            new Vaultbreaker(address(token2), address(registry), address(router2), address(this), ENTRY);
        token2.mint(address(this), ENTRY);
        token2.approve(address(empty), ENTRY);
        (bool ok,) = address(empty).call(abi.encodeWithSelector(empty.start.selector, uint8(0)));
        assert(!ok);
        assert(token2.balanceOf(address(this)) == ENTRY);
    }

    function testCannotWithdrawReservedFunds() public {
        game.start(0);
        uint256 available = token.balanceOf(address(game)) - game.reserved();
        (bool ok,) =
            address(game).call(abi.encodeWithSelector(game.withdrawSurplus.selector, address(this), available + 1));
        assert(!ok);
    }

    function testSafeStageCanAdvanceOnlyToNewFutureRound() public {
        uint256 id = game.start(0);
        (, uint64 first,,,,,) = game.runs(id);
        vm.warp(registry.roundTime(first));
        game.resolve(id, abi.encode(_seedFor(false, id, 1, 0)));
        game.advance(id, 1);
        (, uint64 second, uint8 stage, uint8 choice,,, bool awaiting) = game.runs(id);
        assert(stage == 2 && choice == 1 && awaiting);
        assert(registry.roundTime(second) > block.timestamp + 30);
        (bool early,) = address(game).call(abi.encodeWithSelector(game.resolve.selector, id, bytes("")));
        assert(!early);
    }

    function testCannotClaimTwice() public {
        uint256 id = game.start(0);
        (, uint64 round,,,,,) = game.runs(id);
        vm.warp(registry.roundTime(round));
        game.resolve(id, abi.encode(_seedFor(false, id, 1, 0)));
        game.cashOut(id);
        (bool twice,) = address(game).call(abi.encodeWithSelector(game.cashOut.selector, id));
        assert(!twice);
    }

    function testMaximumSixRelicPayoutIsCovered() public {
        uint256 id = game.start(0);
        for (uint8 stage = 1; stage <= 6; stage++) {
            (, uint64 round,,,,,) = game.runs(id);
            vm.warp(registry.roundTime(round));
            assert(game.resolve(id, abi.encode(_relicSeed(id, stage, 0))) == 2);
            if (stage < 6) game.advance(id, 0);
        }
        (,,,, uint128 credits,,) = game.runs(id);
        assert(credits <= game.maximumPayout());
        game.cashOut(id);
        assert(game.reserved() == 0);
    }
}
