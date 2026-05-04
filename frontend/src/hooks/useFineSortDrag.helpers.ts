interface PlacedCard {
    statementId: number;
    col: number;
    row: number;
}

export type DropTarget =
    | { kind: 'deck'; category: 'agree' | 'neutral' | 'disagree' }
    | { kind: 'slot'; col: number; row: number }
    | { kind: 'none' };

/**
 * Decode a DnD-Kit `over.id` (string) into the participant intent.
 * - `deck-<cat>` or `deck-area-<cat>` → return-to-pile
 * - `slot_<col>_<row>` → place at slot
 * - any other string that matches a placed card's statementId → resolve
 *   to that card's slot
 */
export function resolveDropTarget(overIdRaw: string, qsort: PlacedCard[]): DropTarget {
    let overId = overIdRaw;

    if (overId.startsWith('deck-')) {
        let cat = overId.replace('deck-', '');
        if (cat.startsWith('area-')) cat = cat.replace('area-', '');
        return { kind: 'deck', category: cat as 'agree' | 'neutral' | 'disagree' };
    }

    if (!overId.startsWith('slot_')) {
        const cardId = Number(overId);
        const placed = !Number.isNaN(cardId)
            ? qsort.find((c) => c.statementId === cardId)
            : undefined;
        if (placed) {
            overId = `slot_${placed.col}_${placed.row}`;
        } else {
            return { kind: 'none' };
        }
    }

    const parts = overId.split('_');
    if (parts.length !== 3 || !parts[1] || !parts[2]) return { kind: 'none' };
    const col = parseInt(parts[1], 10);
    const row = parseInt(parts[2], 10);
    if (Number.isNaN(col) || Number.isNaN(row)) return { kind: 'none' };
    return { kind: 'slot', col, row };
}
