import { Contract, JsonRpcProvider, Wallet } from "ethers";

import { env } from "../../config/env.js";
import { CHAIN_CHECK_REGISTRY_ABI } from "./contract.abi.js";

const provider = new JsonRpcProvider(env.CHAIN_RPC_URL);
const wallet = new Wallet(env.CHAIN_PRIVATE_KEY, provider);

export const registry = new Contract(env.CHAIN_CONTRACT_ADDRESS, CHAIN_CHECK_REGISTRY_ABI, wallet);
