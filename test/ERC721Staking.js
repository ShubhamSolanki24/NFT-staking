

import { ethers } from "hardhat";
import { expect } from 'chai';
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Contract } from "ethers";

const REWARD_DURATION = 31556952; // 1 year in seconds
  const REWARD = ethers.utils.parseEther("1000000") // 1000000 ERC20
  const REWARD_RATE = REWARD.div(REWARD_DURATION);

  before(async () => {
    const signers = await ethers.getSigners();
    owner = signers[0];
    nftHolder = signers[1];
    nonNftHolder = signers[2];
    anotherNftHolder = signers[3];

    const MockERC20 = await ethers.getContractFactory("ERC20Token");
    mockERC20 = await ERC20Token.deploy();

    const MockERC721 = await ethers.getContractFactory("NFTCollection");
    mockERC721 = await NFTCollection.deploy();

    const ERC721Staking = await ethers.getContractFactory("ERC721Staking");
    staking = await ERC721Staking.deploy(
      NFTCollection.address,
      ERC20Token.address,
      REWARD_DURATION,
    );
    await mockERC20.mint(staking.address, REWARD);
  });


describe("Staking", () => {

      it("Should stake NFTs successfully", async () => {
        await mockERC721.generateTestAssets(2, nftHolder.address);
        await mockERC721.connect(nftHolder).setApprovalForAll(staking.address, true);

        await staking.connect(nftHolder).stake([1, 2]);

        const balanceOfContract = await mockERC721.balanceOf(staking.address);
        expect(balanceOfContract.toNumber()).to.equal(2);
        expect(await staking.totalSupply()).to.equal(2);
        expect(await staking.balances(nftHolder.address)).to.equal(2);
        expect(await staking.stakedAssets(1)).to.equal(nftHolder.address);
        expect(await staking.stakedAssets(2)).to.equal(nftHolder.address);
      });

      it("Should update fields correctly on second time staking", async () => {
        await mockERC721.generateTestAssets(3, nftHolder.address);
        await mockERC721.connect(nftHolder).setApprovalForAll(staking.address, true);
        await staking.connect(nftHolder).stake([1]);
        expect((await mockERC721.balanceOf(staking.address)).toNumber()).to.equal(1);

        await staking.connect(nftHolder).stake([2, 3]);
        const balanceOfContract = await mockERC721.balanceOf(staking.address);
        expect(balanceOfContract.toNumber()).to.equal(3);
        expect(await staking.totalSupply()).to.equal(3);
        expect(await staking.balances(nftHolder.address)).to.equal(3);
        expect(await staking.stakedAssets(1)).to.equal(nftHolder.address);
        expect(await staking.stakedAssets(2)).to.equal(nftHolder.address);
        expect(await staking.stakedAssets(3)).to.equal(nftHolder.address);
      });

      it("Should emit events correctly", async () => {
        await mockERC721.generateTestAssets(2, nftHolder.address);
        await mockERC721.connect(nftHolder).setApprovalForAll(staking.address, true);

        await expect(staking.connect(nftHolder).stake([1, 2]))
          .to.emit(mockERC721, "Transfer").withArgs(nftHolder.address, staking.address, 1)
          .to.emit(mockERC721, "Transfer").withArgs(nftHolder.address, staking.address, 2)
          .to.emit(staking, "Staked").withArgs(nftHolder.address, 2, [1, 2])
      });

      it("Should revert on staking non-existing tokens", async () => {
        const expectedRevertMessage = 'ERC721: operator query for nonexistent token';
        await mockERC721.connect(nftHolder).setApprovalForAll(staking.address, true);
        await expect(staking.connect(nftHolder).stake([100])).to.be.revertedWith(expectedRevertMessage);
      });

      it("Should revert on staking non-owned tokens", async () => {
        const expectedRevertMessage = 'ERC721: transfer caller is not owner nor approved';
        await mockERC721.generateTestAssets(1, owner.address);
        await mockERC721.connect(nonNftHolder).setApprovalForAll(staking.address, true);
        await expect(staking.connect(nonNftHolder).stake([1])).to.be.revertedWith(expectedRevertMessage);
      });

      it('Should not allow staking of no tokens', async () => {
        const expectedRevertMessage = `Staking: No tokenIds provided`;
        await expect(staking.connect(nftHolder).stake([])).to.be.revertedWith(expectedRevertMessage);
      });

      it('Should not allow staking when paused', async () => {
        const expectedRevertMessage = 'Pausable: paused';
        await staking.pause();

        await expect(staking.connect(nftHolder).stake([1])).to.be.revertedWith(expectedRevertMessage);
      });

    });

    describe('Withdrawal', async () => {

      beforeEach(async () => {
        await mockERC721.generateTestAssets(2, nftHolder.address);
        await mockERC721.connect(nftHolder).setApprovalForAll(staking.address, true);
        await staking.connect(nftHolder).stake([1, 2]);
      });

      it("Should withdraw staked NFTs successfully", async () => {
        const balanceOfContractBefore = await mockERC721.balanceOf(staking.address);
        expect(balanceOfContractBefore.toNumber()).to.equal(2);
        expect(await staking.totalSupply()).to.equal(2);
        expect(await staking.balances(nftHolder.address)).to.equal(2);
        expect(await staking.stakedAssets(1)).to.equal(nftHolder.address);
        expect(await staking.stakedAssets(2)).to.equal(nftHolder.address);

        await staking.connect(nftHolder).withdraw([1, 2]);
        const balanceOfContractAfter = await mockERC721.balanceOf(staking.address);
        expect(balanceOfContractAfter.toNumber()).to.equal(0);

        const balanceOfStaker = await mockERC721.balanceOf(nftHolder.address);
        expect(balanceOfStaker.toNumber()).to.equal(2);
        expect(await mockERC721.ownerOf(1)).to.equal(nftHolder.address);
        expect(await mockERC721.ownerOf(2)).to.equal(nftHolder.address);
        expect(await staking.totalSupply()).to.equal(0);
        expect(await staking.balances(nftHolder.address)).to.equal(0);
        expect(await staking.stakedAssets(1)).to.equal(ethers.constants.AddressZero);
        expect(await staking.stakedAssets(2)).to.equal(ethers.constants.AddressZero);
      });

      it('Should withdraw when paused', async () => {
        await staking.pause();
        await expect(staking.connect(nftHolder).withdraw([1, 2])).to.not.be.reverted;
      });

      it('Should use the same amount even if estate size changes', async () => {

        await staking.connect(nftHolder).withdraw([2]);

        const balanceOfContractAfter = await mockERC721.balanceOf(staking.address);
        expect(balanceOfContractAfter.toNumber()).to.equal(1);

        const balanceOfStaker = await mockERC721.balanceOf(nftHolder.address);
        expect(balanceOfStaker.toNumber()).to.equal(1);
        expect(await mockERC721.ownerOf(1)).to.equal(staking.address);
        expect(await mockERC721.ownerOf(2)).to.equal(nftHolder.address);
        expect(await staking.totalSupply()).to.equal(1);
        expect(await staking.balances(nftHolder.address)).to.equal(1);
        expect(await staking.stakedAssets(1)).to.equal(nftHolder.address);
        expect(await staking.stakedAssets(2)).to.equal(ethers.constants.AddressZero);
      })

      it("Should emit events correctly on Withdraw", async () => {
        await expect(staking.connect(nftHolder).withdraw([1, 2]))
          .to.emit(mockERC721, "Transfer").withArgs(staking.address, nftHolder.address, 1)
          .to.emit(mockERC721, "Transfer").withArgs(staking.address, nftHolder.address, 2)
          .to.emit(staking, "Withdrawn").withArgs(nftHolder.address, 2, [1, 2]);
      });

      it("Should not be able to withdraw NFTs staked by other person", async () => {
        const expectedRevertMessage = 'Staking: Not the staker of the token';
        await expect(staking.connect(nonNftHolder).withdraw([1, 2])).revertedWith(expectedRevertMessage);
      });

      it('Should not allow staking of no tokens', async () => {
        const expectedRevertMessage = `Staking: No tokenIds provided`;
        await expect(staking.connect(nftHolder).withdraw([])).to.be.revertedWith(expectedRevertMessage);
      });
    });

    describe('Rewards', async () => {

      before(async () => {
        await mockERC721.generateTestAssets(10, nftHolder.address);
        await mockERC721.generateTestAssets(10, anotherNftHolder.address);
        await mockERC721.connect(nftHolder).setApprovalForAll(staking.address, true);
        await mockERC721.connect(anotherNftHolder).setApprovalForAll(staking.address, true);
      });

    it('Should be able to exit', async () => {
      await mockERC721.generateTestAssets(2, nftHolder.address);
      await mockERC721.connect(nftHolder).setApprovalForAll(staking.address, true);
      await staking.connect(nftHolder).stake([1, 2]);

      await staking.connect(nftHolder).exit([1, 2]);
      const balanceOfContractAfter = await mockERC721.balanceOf(staking.address);
      expect(balanceOfContractAfter.toNumber()).to.equal(0);

      const balanceOfStaker = await mockERC721.balanceOf(nftHolder.address);
      expect(balanceOfStaker.toNumber()).to.equal(2);
      expect(await mockERC721.ownerOf(1)).to.equal(nftHolder.address);
      expect(await mockERC721.ownerOf(2)).to.equal(nftHolder.address);
      expect(await staking.totalSupply()).to.equal(0);
      expect(await staking.balances(nftHolder.address)).to.equal(0);
      expect(await staking.stakedAssets(1)).to.equal(ethers.constants.AddressZero);
      expect(await staking.stakedAssets(2)).to.equal(ethers.constants.AddressZero);

      expect(await mockERC20.balanceOf(staking.address)).to.equal(REWARD.sub(REWARD_RATE));
      expect(await mockERC20.balanceOf(nftHolder.address)).to.equal(REWARD_RATE);
    });

  });
});
