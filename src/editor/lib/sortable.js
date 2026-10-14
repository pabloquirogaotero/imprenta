import Sortable from 'sortablejs';

export function sortable(node, onMove) {
    let callback = onMove;
    
    const instance = Sortable.create(node, {
        handle: '.js-drag-handle', // only the six-dot handle starts a drag, so text stays selectable
        draggable: '.js-item', // what can be dragged: the cards (not the "no items yet" text)
        animation: 150, // ms for the other cards to slide out of the way
        onEnd(event) {
            const { item, from, oldIndex, newIndex, oldDraggableIndex, newDraggableIndex } = event;
            if (oldIndex === undefined || newIndex === undefined || oldIndex === newIndex) return;
            // SortableJS has already moved the card in the page, but Svelte expects to be the
            // only one changing the page. So put the card back where it was, and change the
            // data instead: Svelte then redraws the list in the new order. One source of truth.
            from.removeChild(item);
            from.insertBefore(item, from.children[oldIndex] ?? null);
            callback(oldDraggableIndex, newDraggableIndex);
        },
    });

    // What Svelte calls later: update() if the component passes a new function, and
    // destroy() when the list disappears from the page.
    return {
        update(next) {
            callback = next;
        },
        destroy() {
            instance.destroy();
        },
    };
}
