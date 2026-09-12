// アプリ側の定数のうち、テストからも参照するもの。
// lib/constants.ts は TypeScript なので .mjs からは直接読めない。値がずれたら
// 単体テスト（lib/__tests__）が先に気づくよう、そちらでも同じ値を確かめている。
export const HANDOVER_TIME = "昼休み";
export const PICKUP_LOCATION = "Forest Gateway 3F";
export const PLATFORM_FEE_RATE = 0.1;

/** 出品者の受取額（手数料10%差引後・切り捨て）。lib/constants.ts の sellerNet と同じ式。 */
export const sellerNet = (price) => Math.floor(price * (1 - PLATFORM_FEE_RATE));
/** プラットフォーム手数料。lib/payment-provider/fees.ts と同じ式。 */
export const applicationFee = (price) => price - sellerNet(price);
