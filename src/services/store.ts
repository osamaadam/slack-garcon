import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import logger from "../logger";
import { TalabatMenu, talabatBranchId } from "./talabat";

export interface KnownRestaurant {
  restaurant: string;
  branch: string;
  url: string;
}

const MENU_TTL_SECONDS = 24 * 3600;
const KEEP_RESTAURANTS = 10;

// Without STATE_TABLE (local runs, the personal Gemini deploy) nothing is cached.
const table = process.env.STATE_TABLE;
const db = table ? DynamoDBDocumentClient.from(new DynamoDBClient({})) : null;

// The cache only saves time and Talabat requests, so a store failure is logged
// and the bot carries on with a live fetch.
async function get<T>(pk: string): Promise<T | null> {
  if (!db) return null;
  try {
    const res = await db.send(new GetCommand({ TableName: table, Key: { pk } }));
    return (res.Item?.value as T) ?? null;
  } catch (error) {
    logger.warn("State read failed", { pk, error });
    return null;
  }
}

async function put(pk: string, value: unknown, ttlSeconds?: number): Promise<void> {
  if (!db) return;
  try {
    const ttl = ttlSeconds ? Math.floor(Date.now() / 1000) + ttlSeconds : undefined;
    await db.send(new PutCommand({ TableName: table, Item: { pk, value, ...(ttl && { ttl }) } }));
  } catch (error) {
    logger.warn("State write failed", { pk, error });
  }
}

const menuKey = (url: string) => `menu#${talabatBranchId(url)}`;

export const getCachedMenu = (url: string) => get<TalabatMenu>(menuKey(url));
export const cacheMenu = (menu: TalabatMenu) => put(menuKey(menu.url), menu, MENU_TTL_SECONDS);

export async function getChannelRestaurants(channel: string): Promise<KnownRestaurant[]> {
  return (await get<KnownRestaurant[]>(`channel#${channel}`)) ?? [];
}

export async function rememberRestaurant(channel: string, menu: TalabatMenu): Promise<void> {
  const known = await getChannelRestaurants(channel);
  const id = talabatBranchId(menu.url);
  const next = [
    { restaurant: menu.restaurant, branch: menu.branch, url: menu.url },
    ...known.filter((k) => talabatBranchId(k.url) !== id),
  ].slice(0, KEEP_RESTAURANTS);
  await put(`channel#${channel}`, next);
}
