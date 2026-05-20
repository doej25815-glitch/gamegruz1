// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract EvilSquirrelOnchain {
    uint256 public constant CHECKIN_INTERVAL = 2 minutes;
    uint256 public constant CHECKIN_PRICE = 0.00001 ether;
    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint256 public constant STREAK_BONUS_BPS = 1_000; // +10% per streak step
    string public constant BASE_BUILDER_CODE = "bc_orvodcta";
    bytes public constant BASE_BUILDER_CODE_DATA_SUFFIX =
        hex"62635f6f72766f646374610b0080218021802180218021802180218021";

    address public owner;

    struct Player {
        uint256 score;
        uint256 totalPaid;
        uint32 streak;
        uint64 lastCheckinSlot;
        uint32 totalCheckins;
    }

    struct LeaderboardEntry {
        address player;
        uint256 score;
    }

    mapping(address => Player) public players;
    address[] private _participants;
    mapping(address => bool) private _seen;

    event CheckedIn(address indexed player, uint256 streak, uint256 slot, uint256 paid);
    event Tapped(address indexed player, uint256 taps, uint256 gainedPoints, uint256 totalScore, uint256 streak);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event Withdrawn(address indexed to, uint256 amount);

    error InvalidCheckinPayment(uint256 requiredAmount, uint256 sentAmount);
    error Unauthorized();
    error InvalidOwner();
    error WithdrawFailed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    function currentSlot() public view returns (uint256) {
        return block.timestamp / CHECKIN_INTERVAL;
    }

    function canCheckInNow(address player) public view returns (bool) {
        return players[player].lastCheckinSlot < currentSlot();
    }

    function checkIn() external payable {
        if (msg.value != CHECKIN_PRICE) {
            revert InvalidCheckinPayment(CHECKIN_PRICE, msg.value);
        }

        Player storage p = players[msg.sender];
        uint256 slot = currentSlot();
        require(p.lastCheckinSlot < slot, "Already checked in this slot");

        if (p.lastCheckinSlot + 1 == slot && p.lastCheckinSlot != 0) {
            p.streak += 1;
        } else {
            p.streak = 1;
        }

        p.lastCheckinSlot = uint64(slot);
        p.totalCheckins += 1;
        p.totalPaid += msg.value;
        _register(msg.sender);

        emit CheckedIn(msg.sender, p.streak, slot, msg.value);
    }

    function tap(uint256 tapsCount) external {
        require(tapsCount > 0 && tapsCount <= 1000, "Invalid tapsCount");

        Player storage p = players[msg.sender];
        uint256 multiplierBps = BPS_DENOMINATOR + uint256(p.streak) * STREAK_BONUS_BPS;
        uint256 gained = (tapsCount * multiplierBps) / BPS_DENOMINATOR;

        p.score += gained;
        _register(msg.sender);

        emit Tapped(msg.sender, tapsCount, gained, p.score, p.streak);
    }

    function getPlayer(
        address player
    )
        external
        view
        returns (uint256 score, uint256 streak, uint256 lastCheckinSlot, bool canCheckin, uint256 totalCheckins)
    {
        Player storage p = players[player];
        return (p.score, p.streak, p.lastCheckinSlot, canCheckInNow(player), p.totalCheckins);
    }

    function participantsCount() external view returns (uint256) {
        return _participants.length;
    }

    function contractBalance() external view returns (uint256) {
        return address(this).balance;
    }

    function withdraw() external onlyOwner {
        _withdraw(payable(owner), address(this).balance);
    }

    function withdrawTo(address payable to) external onlyOwner {
        if (to == address(0)) revert InvalidOwner();
        _withdraw(to, address(this).balance);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidOwner();
        address previousOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(previousOwner, newOwner);
    }

    function getLeaderboard(uint256 limit) external view returns (LeaderboardEntry[] memory) {
        uint256 count = _participants.length;
        if (limit == 0 || limit > count) limit = count;

        LeaderboardEntry[] memory temp = new LeaderboardEntry[](count);
        for (uint256 i = 0; i < count; i++) {
            address player = _participants[i];
            temp[i] = LeaderboardEntry(player, players[player].score);
        }

        for (uint256 i = 0; i < count; i++) {
            for (uint256 j = i + 1; j < count; j++) {
                if (temp[j].score > temp[i].score) {
                    LeaderboardEntry memory swap = temp[i];
                    temp[i] = temp[j];
                    temp[j] = swap;
                }
            }
        }

        LeaderboardEntry[] memory result = new LeaderboardEntry[](limit);
        for (uint256 i = 0; i < limit; i++) {
            result[i] = temp[i];
        }
        return result;
    }

    function _register(address player) internal {
        if (!_seen[player]) {
            _seen[player] = true;
            _participants.push(player);
        }
    }

    function _withdraw(address payable to, uint256 amount) private {
        (bool success, ) = to.call{value: amount}("");
        if (!success) revert WithdrawFailed();
        emit Withdrawn(to, amount);
    }

    receive() external payable {}
}
