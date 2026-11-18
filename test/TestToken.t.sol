// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "../contracts/TestToken.sol";

interface VmToken {
    function chainId(uint256 id) external;
}

contract TestTokenTest {
    VmToken private constant vm = VmToken(address(uint160(uint256(keccak256("hevm cheat code")))));

    function testFaucetAndExactTransfer() public {
        vm.chainId(46630);
        TestToken token = new TestToken();
        uint256 initial = token.balanceOf(address(this));
        token.claimFaucet();
        assert(token.balanceOf(address(this)) == initial + 100e6);
        (bool second,) = address(token).call(abi.encodeWithSelector(token.claimFaucet.selector));
        assert(!second);
        token.transfer(address(0xBEEF), 7e6);
        assert(token.balanceOf(address(0xBEEF)) == 7e6);
    }
}
