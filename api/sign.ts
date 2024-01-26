import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Contract, Wallet, isAddress, JsonRpcProvider, toUtf8Bytes, encodeBase58, sha256 } from "ethers";

export const readTweet = async (uri: string) => {
  let res;
  try {
    new URL(uri);
    res = await (await fetch(`https://publish.twitter.com/oembed?url=${encodeURIComponent(uri)}`)).json();
  } catch {}
  return res;
};
const wrap = (s: string) => encodeBase58(toUtf8Bytes(s));
const genGid = (address: string) => wrap(sha256(toUtf8Bytes(`${address}@riffian.global`))).substring(0, 22);
export const verifyAccount = async (acc: string, chain: ChainName): Promise<boolean> => {
  if (!isAddress(acc)) return false;
  const contract = new Contract(Chain[chain].boardContract, abi, provider(chain));
  const [[platform, , uri]] = (await contract.getSocials(acc)) ?? [];
  if (platform !== "twitter") return false;
  const { author_name = "", html = "" } = (await readTweet(uri)) ?? {};
  if (!author_name) return false;
  const [, official, gid = ""] = html.match(new RegExp(`@(\\w+)?.*?Gid: (\\w+)?`)) ?? [];
  if (official !== "RiffianClub" || !gid) return false;
  return gid === genGid(acc);
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") return res.status(200).end();
  res.setHeader("Access-Control-Allow-Credentials", true);
  res.setHeader("Access-Control-Allow-Origin", "*");
  const { acc = "", chain = "mainnet" } = req.query;
  if (!acc || !["mainnet", "testnet"].includes(chain)) return res.status(400).end();
  if (!(await verifyAccount(acc, chain))) return res.status(403).end();
  let sig;
  try {
    sig = await sign(acc, chain);
  } catch {}
  return res.json({ sig });
}

type ChainName = "mainnet" | "testnet";
export const Chain = {
  mainnet: {
    chainId: "0xd01d",
    boardContract: "0xc6712F4B2EeDe48D5BA8f09Db56C820F4A236828",
    verifyingContract: "0x1395Dd9C0E35af75e7e1BC7846f14c53558A8F6F",
    rpc: "https://rpc.doid.tech",
    signer: undefined as any,
  },
  testnet: {
    chainId: "0xdddd",
    boardContract: "0x6c5BDD99537F344838796DeDFf6cD98b4908c57c",
    verifyingContract: "0x8AD7E2eC2AF30F01b65Af8D60318943b43D5E03F",
    rpc: "https://rpc.testnet.doid.tech",
    signer: undefined as any,
  },
};
export const provider = (chain: ChainName) => new JsonRpcProvider(Chain[chain].rpc);
export const sign = async (account: string, chain: ChainName) => {
  let { chainId, signer, rpc, verifyingContract } = Chain[chain];
  signer ??= Chain[chain].signer = new Wallet(process.env.SIGNER, provider(chain));
  return await signer.signTypedData(
    {
      name: "RiffianAirdrop",
      version: "1.0.0",
      chainId,
      verifyingContract,
    },
    { Account: [{ name: "account", type: "address" }] },
    { account }
  );
};

const abi = [
  {
    inputs: [{ internalType: "address", name: "_owner", type: "address" }],
    name: "getSocials",
    outputs: [
      {
        components: [
          { internalType: "string", name: "platform", type: "string" },
          { internalType: "string", name: "id", type: "string" },
          { internalType: "string", name: "uri", type: "string" },
        ],
        internalType: "struct SocialData[]",
        name: "_socials",
        type: "tuple[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
];
