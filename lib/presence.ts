/** care/server の isOnline フラグが古いまま残っていても、この時間を過ぎたら
 * オフライン扱いにするための鮮度しきい値(サーバークラッシュ時の自己修復用)。
 * care/server 側の定期スイープ間隔(60秒)より十分長く取っている。
 */
export const ONLINE_FRESH_MS = 3 * 60 * 1000;

export function isUserOnline(user: {
  isOnline?: boolean | null;
  lastSocketAt?: Date | string | null;
}): boolean {
  if (!user.isOnline || !user.lastSocketAt) {
    return false;
  }
  return Date.now() - new Date(user.lastSocketAt).getTime() < ONLINE_FRESH_MS;
}
