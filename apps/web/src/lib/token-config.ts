const defaultTokenName = 'Builder Test';
const defaultTokenSymbol = 'BUILD';
const defaultTokenDescription = 'Unlock the possibilities of collective creation';

export const TOKEN_NAME = process.env.NEXT_PUBLIC_STELLAR_TOKEN_NAME ?? defaultTokenName;
export const TOKEN_SYMBOL = process.env.NEXT_PUBLIC_STELLAR_TOKEN_SYMBOL ?? defaultTokenSymbol;
export const TOKEN_DESCRIPTION =
  process.env.NEXT_PUBLIC_STELLAR_TOKEN_DESCRIPTION ?? defaultTokenDescription;

export function getTokenDisplayName(tokenId: number) {
  return `${TOKEN_NAME} #${tokenId}`;
}
