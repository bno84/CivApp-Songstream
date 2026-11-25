// SPDX-License-Identifier: AGPL-3.0-or-later

export function FavoriteButton({ title, starred, onToggle }: {
  title: string;
  starred: boolean;
  onToggle: (() => void) | undefined;
}) {
  return (
    <button type="button" className="favorite-button" aria-label={`Favorite ${title}`} aria-pressed={starred}
      title={starred ? 'Remove from Favorites' : 'Add to Favorites'} disabled={!onToggle} onClick={onToggle}>
      <span aria-hidden="true">{starred ? '★' : '☆'}</span>
    </button>
  );
}
