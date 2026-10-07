const NICKNAME_KEY = 'dessineo.nickname';

export function loadNickname(): string {
  try {
    return localStorage.getItem(NICKNAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveNickname(nickname: string): void {
  try {
    localStorage.setItem(NICKNAME_KEY, nickname);
  } catch {
    // stockage indisponible (navigation privée…) : le pseudo sera redemandé
  }
}
