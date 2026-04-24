import type { FirebaseAccountSnapshot } from "./firebaseAuth";

const DEFAULT_GUEST_NAME = "Guest";

export function getAccountPlayerName(account: FirebaseAccountSnapshot): string {
  return cleanPlayerName(account.displayName)
    ?? cleanPlayerName(getEmailHandle(account.email))
    ?? DEFAULT_GUEST_NAME;
}

export function formatBattleText(text: string, playerName: string, opponentName: string): string {
  const player = cleanPlayerName(playerName) ?? DEFAULT_GUEST_NAME;
  const opponent = cleanPlayerName(opponentName) ?? "Opponent";
  const playerPossessive = possessiveName(player);
  const opponentPossessive = possessiveName(opponent);
  const replacements: Array<[string, string]> = [
    ["Opponent's", "§OPP_POS§"],
    ["opponent's", "§OPP_POS§"],
    ["Your", "§PLAYER_POS§"],
    ["your", "§PLAYER_POS§"],
    ["Opponent", "§OPP§"],
    ["opponent", "§OPP§"],
    ["You are", "§PLAYER§ is"],
    ["you are", "§PLAYER§ is"],
    ["You were", "§PLAYER§ was"],
    ["you were", "§PLAYER§ was"],
    ["You have", "§PLAYER§ has"],
    ["you have", "§PLAYER§ has"],
    ["You ", "§PLAYER§ "],
    ["you ", "§PLAYER§ "],
  ];

  let formatted = text;
  replacements.forEach(([search, replacement]) => {
    formatted = replaceAllLiteral(formatted, search, replacement);
  });

  return replaceAllLiteral(
    replaceAllLiteral(
      replaceAllLiteral(
        replaceAllLiteral(formatted, "§PLAYER_POS§", playerPossessive),
        "§OPP_POS§",
        opponentPossessive,
      ),
      "§PLAYER§",
      player,
    ),
    "§OPP§",
    opponent,
  );
}

function getEmailHandle(email: string | null): string | null {
  if (!email) return null;
  return email.split("@")[0] ?? null;
}

function cleanPlayerName(name: string | null | undefined): string | null {
  const cleaned = name?.trim().replace(/\s+/g, " ");
  return cleaned ? cleaned : null;
}

function possessiveName(name: string): string {
  return name.endsWith("s") || name.endsWith("S") ? `${name}'` : `${name}'s`;
}

function replaceAllLiteral(input: string, search: string, replacement: string): string {
  return input.split(search).join(replacement);
}
