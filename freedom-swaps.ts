import { ethers } from "./deps.ts"
import { freedomSwapsABI, freiheitsABI, wMaticABI, getLogger, getProvider, FreedomSwapsCA, getContract, Matic, getAddressFromPK } from "./mod.ts"

export class FreedomSwaps {

    private static instance: FreedomSwaps

    public static async getInstance(providerURL: string): Promise<FreedomSwaps> {
        if (FreedomSwaps.instance === undefined) {
            const logger = await getLogger()
            const provider = getProvider(logger, providerURL)
            FreedomSwaps.instance = new FreedomSwaps(logger, provider)
        }
        return FreedomSwaps.instance
    }

    public static async swapStatic() {
        const tokenIn = Deno.args[0] // e.g. "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270" // Matic on Polygon POS
        const tokenOut = Deno.args[1] // e.g. "0x099471B71c9D8b0C6b616eE9A7C645e22cA9cfF7" // Freiheit on Polygon POS
        const amountIn = BigInt(Deno.args[2]) // e.g. 1000000000000000000 (assuming 18 decimals this would swap 1 Coin)
        const poolFee = Deno.args[3] // e.g. 10000
        const slippage = Deno.args[4] // e.g. 9
        const providerURL = Deno.args[5] // e.g. https://polygon-mainnet.g.alchemy.com/v2/...
        const pkTestWallet = Deno.args[6] // e.g. <experiment with small amounts / wallets>

        if (tokenIn === undefined || tokenOut === undefined || amountIn === undefined || poolFee === undefined ||
            slippage === undefined || providerURL === undefined || pkTestWallet === undefined) {
            throw new Error("parameter missing")
        }

        const freedomSwaps = await FreedomSwaps.getInstance(providerURL)
        await freedomSwaps.swap(tokenIn, tokenOut, amountIn, poolFee, slippage, pkTestWallet)
    }

    private logger
    private provider

    private constructor(logger: any, provider: any) {
        this.logger = logger
        this.provider = provider
    }

    public async swap(tokenIn: string, tokenOut: string, amountIn: bigint, poolFee: number, slippage: number, pkTestWallet: string) {
        let tx
        const erc20Contract = await getContract(tokenIn, freiheitsABI, this.provider, pkTestWallet)
        const decimals = Number(await erc20Contract.decimals())
        const freedomSwapsContract = await getContract(FreedomSwapsCA, freedomSwapsABI, this.provider, pkTestWallet)
        if (tokenIn === Matic) {
            this.logger.info(`swapping ${amountIn} of BaseCurrency ${tokenIn} to ${tokenOut} - poolFee: ${poolFee} slippage: ${slippage}`)
            tx = await freedomSwapsContract.swapBaseCurrency(tokenIn, tokenOut, poolFee, slippage, { value: amountIn })
        } else {
            const address = getAddressFromPK(pkTestWallet, this.provider)
            const allowance = await erc20Contract.allowance(address, FreedomSwapsCA)
            this.logger.info(`the allowance from ${address} for ${FreedomSwapsCA} is: ${allowance}`)
            if (allowance < amountIn) {
                tx = await erc20Contract.approve(FreedomSwapsCA, BigInt(360) * amountIn)
                this.logger.info(`approval tx: https://polygonscan.com/tx/${tx.hash}`)
                await tx.wait()
            }
            this.logger.info(`swapping ${amountIn} of ${tokenIn} to ${tokenOut} - poolFee: ${poolFee} slippage: ${slippage}`)
            tx = await freedomSwapsContract.swapExactInputSingle(tokenIn, tokenOut, amountIn, poolFee, slippage)
        }
        this.logger.info(`swap tx: https://polygonscan.com/tx/${tx.hash}`)
        await tx.wait()
    }

    public async unwrap(pkTestWallet: string) {
        const address = getAddressFromPK(pkTestWallet, this.provider)
        const wmaticContract = await getContract(Matic, wMaticABI, this.provider, pkTestWallet)
        const wMaticBalance = await wmaticContract.balanceOf(address)
        const tx = await wmaticContract.withdraw(wMaticBalance)
        this.logger.info(`unwrap tx: https://polygonscan.com/tx/${tx.hash}`)
        await tx.wait()
    }

    public async getPrice(tokenContractAddress1: string, tokenContractAddress2: string, poolFee: number, pkTestWallet: string): Promise<number> {
        const freedomSwapsContract = await getContract(FreedomSwapsCA, freedomSwapsABI, this.provider, pkTestWallet)
        const priceFromSC = ethers.formatEther(await freedomSwapsContract.getPrice(tokenContractAddress1, tokenContractAddress2, poolFee))
        return Number(priceFromSC)
    }
}