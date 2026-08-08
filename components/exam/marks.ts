/**
 * The DOM half of passage highlighting: turning a selection into <mark>
 * wrappers, and back. Kept apart from the hook because all of it is plain DOM
 * surgery over a Range, with no React in it.
 */

/** The three fills the toolbar offers. */
export type HighlightColor = "yellow" | "blue" | "pink";

/** The three line styles behind the toolbar's underline menu. */
export type UnderlineKind = "solid" | "dashed" | "dotted";

/**
 * What a mark looks like: a fill, and optionally a rule under it.
 *
 * An underline is a layer over a highlight, never a substitute for one — in
 * Bluebook you cannot underline text without highlighting it — so the colour is
 * not optional and choosing an underline keeps whatever fill is already there.
 */
export interface MarkStyle {
  color: HighlightColor;
  underline: UnderlineKind | null;
}

export const COLORS: HighlightColor[] = ["yellow", "blue", "pink"];

/** The fills, as sampled from Bluebook. */
export const FILLS: Record<HighlightColor, string> = {
  yellow: "#fdf0b4",
  blue: "#d8e8f8",
  pink: "#f9d3e6",
};
export const UNDERLINES: UnderlineKind[] = ["solid", "dashed", "dotted"];

const isColor = (v: string | undefined): v is HighlightColor =>
  !!v && (COLORS as string[]).includes(v);
const isKind = (v: string | undefined): v is UnderlineKind =>
  !!v && (UNDERLINES as string[]).includes(v);

export const sameStyle = (a: MarkStyle, b: MarkStyle) =>
  a.color === b.color && a.underline === b.underline;

/**
 * The style a mark is carrying.
 *
 * Marks written before underlines became a layer stored them *as* the colour
 * (`data-hl="underline-dashed"`); those read back as a yellow highlight wearing
 * that rule, which is what they will be re-saved as the next time they are
 * touched.
 */
export function readStyle(mark: HTMLElement): MarkStyle {
  const hl = mark.dataset.hl;
  if (hl?.startsWith("underline")) {
    const legacy = hl.slice("underline-".length);
    return { color: "yellow", underline: isKind(legacy) ? legacy : "solid" };
  }
  return {
    color: isColor(hl) ? hl : "yellow",
    underline: isKind(mark.dataset.ul) ? mark.dataset.ul : null,
  };
}

export const MARK = "mark.bb-hl";

/**
 * One selection is one highlight, even when the text it covered was split across
 * paragraphs or list items and had to become several <mark> elements. They share
 * a `data-gid`, and every toolbar action resolves to the whole group — so
 * recolouring, underlining or deleting any part of a highlight does all of it.
 */
export function groupOf(mark: HTMLElement, root: Element): HTMLElement[] {
  const gid = mark.dataset.gid;
  if (!gid) return [mark];
  return [...root.querySelectorAll<HTMLElement>(MARK)].filter((m) => m.dataset.gid === gid);
}

/** The group a mark belongs to, which is also the id any note on it carries. */
export const groupId = (mark: HTMLElement) => mark.dataset.gid ?? "";

export function writeStyle(mark: HTMLElement, style: MarkStyle) {
  mark.dataset.hl = style.color;
  if (style.underline) mark.dataset.ul = style.underline;
  else delete mark.dataset.ul;
}

/**
 * A note and the id that ties it to its highlight. One selection can become
 * several marks, and they share an id so the notes panel lists one card.
 */
export function writeNote(mark: HTMLElement, text: string, id: string) {
  if (text.trim()) {
    mark.dataset.note = text.trim();
    mark.dataset.nid = id;
  } else {
    delete mark.dataset.note;
    delete mark.dataset.nid;
  }
}

export interface MarkNote {
  /** Shared by every mark the note was made across. */
  id: string;
  /** The highlighted text the note hangs off, for the card's heading. */
  text: string;
  note: string;
  /** The highlight's colour, which the card is tinted with. */
  color: HighlightColor;
}

/** Every note in the passage, in document order, one entry per highlight. */
export function notesIn(root: Element): MarkNote[] {
  const byId = new Map<string, MarkNote>();
  for (const mark of root.querySelectorAll<HTMLElement>(MARK)) {
    const note = mark.dataset.note;
    if (!note) continue;
    // Marks saved before notes carried ids group by their text instead.
    const id = mark.dataset.nid || `legacy:${note}`;
    const found = byId.get(id);
    if (found) found.text += mark.textContent ?? "";
    else byId.set(id, { id, text: mark.textContent ?? "", note, color: readStyle(mark).color });
  }
  return [...byId.values()];
}

/** The marks carrying one note. */
export function marksWithNote(root: Element, id: string): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(MARK)].filter(
    (mark) => (mark.dataset.nid || `legacy:${mark.dataset.note}`) === id && mark.dataset.note,
  );
}

export function unwrap(mark: Element) {
  const parent = mark.parentNode;
  if (!parent) return;
  while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
  parent.removeChild(mark);
  parent.normalize();
}

/** The highlight a boundary point sits inside, if any. */
export function markAround(node: Node | null, root: Element): HTMLElement | null {
  const el = node?.nodeType === Node.ELEMENT_NODE ? (node as Element) : node?.parentElement;
  const found = el?.closest?.(MARK) as HTMLElement | null;
  return found && root.contains(found) ? found : null;
}

/** The text nodes under `el` that carry something. */
function textNodesIn(el: Element): Text[] {
  const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const out: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if ((n as Text).data.trim()) out.push(n as Text);
  }
  return out;
}

/**
 * True when `range` covers every character of `el`.
 *
 * Compared per text node rather than with `compareBoundaryPoints` against the
 * element: the same position is a different boundary point at each depth — a
 * range starting at `(text, 0)` sits *after* `(mark, 0)` — so comparing an
 * element to a range that starts inside its own text never looks covered.
 */
export function covers(range: Range, el: Element): boolean {
  const texts = textNodesIn(el);
  if (!texts.length) return false;
  return texts.every((text) => {
    if (text === range.startContainer && range.startOffset > 0) return false;
    if (text === range.endContainer && range.endOffset < text.data.length) return false;
    return range.intersectsNode(text);
  });
}

const isBlank = (frag: DocumentFragment) => !frag.textContent && !frag.firstElementChild;

/**
 * The slices of text the range actually covers, node by node.
 *
 * Highlighting is applied per text node rather than by wrapping the range
 * whole: a selection that crosses a paragraph or list boundary is not
 * surroundable, and extracting it into a single <mark> pulls block elements
 * inside an inline wrapper, which reflows the passage.
 */
export function coveredSlices(range: Range, root: Element) {
  const doc = root.ownerDocument;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const text = node as Text;
      if (!text.data.trim()) return NodeFilter.FILTER_REJECT;
      // MathML has no room for a <mark>: an unknown element inside <math> is
      // dropped from the layout and the expression renders wrong.
      if (text.parentElement?.closest("math")) return NodeFilter.FILTER_REJECT;
      return range.intersectsNode(text) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });

  const out: { node: Text; start: number; end: number }[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const node = n as Text;
    const start =
      node === range.startContainer ? Math.min(range.startOffset, node.data.length) : 0;
    const end =
      node === range.endContainer ? Math.min(range.endOffset, node.data.length) : node.data.length;
    if (end > start) out.push({ node, start, end });
  }
  return out;
}

/**
 * Cuts `mark` in two at a boundary inside it, so the part before the boundary
 * becomes its own mark. Style and note are copied onto both halves.
 */
function splitMarkAt(mark: HTMLElement, node: Node, offset: number) {
  if (!mark.contains(node)) return;
  const doc = mark.ownerDocument;

  const head = doc.createRange();
  const tail = doc.createRange();
  try {
    head.setStart(mark, 0);
    head.setEnd(node, offset);
    tail.setStart(node, offset);
    tail.setEnd(mark, mark.childNodes.length);
  } catch {
    return;
  }
  /*
   * Nothing on one side means the boundary already sits at an edge of the mark.
   * That is not a split, and extracting for it would move every node the
   * caller's range is anchored to and collapse the range. Emptiness has to be
   * measured by content: `(text, length)` and `(mark, childCount)` are the same
   * position, so neither `Range.collapsed` nor a boundary-point comparison sees
   * them as equal.
   */
  if (isBlank(head.cloneContents()) || isBlank(tail.cloneContents())) return;

  const clone = mark.cloneNode(false) as HTMLElement;
  clone.appendChild(head.extractContents());
  mark.parentNode?.insertBefore(clone, mark);
}

/**
 * Splits any highlight the selection only partly overlaps, at both of its
 * edges, so every mark the selection touches afterwards is one it fully
 * covers. That is what lets part of an existing highlight be recoloured or
 * erased — without it the old and new marks overlap and end up nested.
 */
export function splitEdges(range: Range, root: Element) {
  const atStart = markAround(range.startContainer, root);
  if (atStart) splitMarkAt(atStart, range.startContainer, range.startOffset);
  const atEnd = markAround(range.endContainer, root);
  if (atEnd) splitMarkAt(atEnd, range.endContainer, range.endOffset);
}

/** The marks inside `root` that `range` fully covers. */
function coveredMarks(range: Range, root: Element): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(MARK)].filter(
    (mark) => range.intersectsNode(mark) && covers(range, mark),
  );
}

/**
 * How a toolbar action changes what it lands on. Taking a function rather than a
 * style is what lets the two controls stay independent: picking a colour keeps
 * the rule an existing mark already has, and picking an underline keeps its
 * fill. `null` means the text was not highlighted yet.
 */
export type StyleChange = (current: MarkStyle | null) => MarkStyle;

/**
 * Paints the range, reusing the highlights it covers rather than nesting new
 * ones inside them — restyling in place is also what keeps their notes.
 * Returns every mark the selection now owns.
 */
export function paint(range: Range, root: Element, change: StyleChange): HTMLElement[] {
  splitEdges(range, root);

  const marks: HTMLElement[] = [];
  for (const existing of coveredMarks(range, root)) {
    writeStyle(existing, change(readStyle(existing)));
    marks.push(existing);
  }

  // Offsets are read before any wrapping, since surroundContents splits the
  // text node it is given.
  for (const slice of coveredSlices(range, root)) {
    if (slice.node.parentElement?.closest(MARK)) continue; // restyled above
    const own = root.ownerDocument.createRange();
    own.setStart(slice.node, slice.start);
    own.setEnd(slice.node, slice.end);
    const wrapper = root.ownerDocument.createElement("mark");
    wrapper.className = "bb-hl";
    writeStyle(wrapper, change(null));
    try {
      own.surroundContents(wrapper);
      marks.push(wrapper);
    } catch (err) {
      console.error("Could not highlight selection", err);
    }
  }

  /*
   * Everything this one selection touched becomes one highlight, under a group
   * id of its own. Always a fresh one: painting over whole highlights merges
   * them into this one, and painting over part of an existing highlight splits
   * that part off — which is right, because the part left behind keeps a
   * different style and is no longer the same highlight.
   */
  if (marks.length) {
    const gid = crypto.randomUUID();
    marks.forEach((mark) => {
      mark.dataset.gid = gid;
    });
  }
  return marks;
}

/**
 * Removes the highlighting under a selection, keeping whatever it only clips.
 * A selection that touches a highlight takes the whole of it, since a highlight
 * split across paragraphs is still one highlight.
 */
export function erase(range: Range, root: Element) {
  splitEdges(range, root);
  // Collected before unwrapping any of them: unwrap normalizes text nodes,
  // which moves the range the remaining tests would be made against.
  const doomed = new Set<HTMLElement>();
  for (const mark of coveredMarks(range, root)) {
    for (const sibling of groupOf(mark, root)) doomed.add(sibling);
  }
  doomed.forEach(unwrap);
}

export function eraseAll(root: Element) {
  root.querySelectorAll(MARK).forEach(unwrap);
}
