/**
 * Verification for passage highlighting's DOM surgery, run outside Next:
 *   npx tsx scripts/verify-marks.mts
 *
 * Range work is easy to get subtly wrong — the same position is a different
 * boundary point at every depth, and extracting content moves the nodes a live
 * range is anchored to — so the cases that broke during development are pinned
 * here: highlighting across a block boundary, recolouring and erasing part of
 * an existing highlight, and leaving MathML alone.
 */
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><body><div id=root></div></body>");
const g = globalThis as unknown as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
g.Node = dom.window.Node;
g.NodeFilter = dom.window.NodeFilter;
g.Range = dom.window.Range;
g.HTMLElement = dom.window.HTMLElement;
g.Element = dom.window.Element;

// Imported after the globals exist: the module reaches for `Node`/`NodeFilter`.
const { paint, erase, eraseAll, writeNote, notesIn, marksWithNote, groupOf } = await import(
  "@/components/exam/marks"
);

type Color = "yellow" | "blue" | "pink";
type Kind = "solid" | "dashed" | "dotted";
type Style = { color: Color; underline: Kind | null };

/** The two toolbar actions, as the hook builds them. */
const fill =
  (color: Color) =>
  (cur: Style | null): Style => ({ color, underline: cur?.underline ?? null });
const rule =
  (kind: Kind | null, armed: Color = "yellow") =>
  (cur: Style | null): Style => ({ color: cur?.color ?? armed, underline: kind });

const doc = dom.window.document;
const root = doc.getElementById("root")!;

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = String(actual) === String(expected);
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) console.log(`        expected: ${expected}\n        actual:   ${actual}`);
}

/** A range over the substring `needle` inside the `nth` match of `selector`. */
function rangeOver(selector: string, needle: string, nth = 0) {
  const el = root.querySelectorAll(selector)[nth] as Element;
  const walker = doc.createTreeWalker(el, dom.window.NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n as Text;
    const i = text.data.indexOf(needle);
    if (i >= 0) {
      const r = doc.createRange();
      r.setStart(text, i);
      r.setEnd(text, i + needle.length);
      return r;
    }
  }
  throw new Error(`no "${needle}" in ${selector}`);
}

/** A range running from a substring in one element to one in another. */
function rangeAcross(
  aSel: string,
  aNeedle: string,
  bSel: string,
  bNeedle: string,
  aNth = 0,
  bNth = 0,
) {
  const a = rangeOver(aSel, aNeedle, aNth);
  const b = rangeOver(bSel, bNeedle, bNth);
  const r = doc.createRange();
  r.setStart(a.startContainer, a.startOffset);
  r.setEnd(b.endContainer, b.endOffset);
  return r;
}

const reset = (html: string) => {
  root.innerHTML = html;
};

/** Markup with the random group ids taken out, for exact comparisons. */
const shape = () => root.innerHTML.replace(/ data-gid="[^"]*"/g, "");

console.log("\n1. A highlight inside one paragraph");
reset("<p>The quick brown fox jumps over the lazy dog.</p>");
paint(rangeOver("p", "brown fox"), root, fill("yellow"));
check(
  "wraps exactly the selection",
  shape(),
  '<p>The quick <mark class="bb-hl" data-hl="yellow">brown fox</mark> jumps over the lazy dog.</p>',
);
check("text is unchanged", root.textContent, "The quick brown fox jumps over the lazy dog.");

console.log("\n2. A highlight across a block boundary");
reset("<p>First paragraph here.</p><p>Second paragraph here.</p>");
const across = paint(rangeAcross("p", "paragraph here.", "p", "Second", 0, 1), root, fill("blue"));
check("one mark per block", across.length, 2);
check(
  "block structure survives",
  shape(),
  '<p>First <mark class="bb-hl" data-hl="blue">paragraph here.</mark></p>' +
    '<p><mark class="bb-hl" data-hl="blue">Second</mark> paragraph here.</p>',
);
check("no mark wraps a block", root.querySelectorAll("mark p").length, 0);

console.log("\n3. Recolouring part of a highlight");
reset("<p>alpha beta gamma delta</p>");
paint(rangeOver("p", "beta gamma"), root, fill("yellow"));
paint(rangeOver("mark", "gamma"), root, fill("pink"));
check("nothing nests", root.querySelectorAll("mark mark").length, 0);
check(
  "the recoloured part is its own highlight now",
  new Set([...root.querySelectorAll("mark")].map((m) => (m as HTMLElement).dataset.gid)).size,
  2,
);
check(
  "the old mark is split at the selection",
  shape(),
  '<p>alpha <mark class="bb-hl" data-hl="yellow">beta </mark>' +
    '<mark class="bb-hl" data-hl="pink">gamma</mark> delta</p>',
);
check("text is unchanged", root.textContent, "alpha beta gamma delta");

console.log("\n4. Erasing any part of a highlight erases the whole highlight");
reset("<p>one two three four five</p>");
paint(rangeOver("p", "two three"), root, fill("yellow"));
paint(rangeOver("p", "five"), root, fill("blue"));
erase(rangeOver("mark", "three"), root);
check("the highlight went entirely", root.querySelectorAll('mark[data-hl="yellow"]').length, 0);
check("the other highlight is untouched", root.querySelectorAll('mark[data-hl="blue"]').length, 1);
check("text is unchanged", root.textContent, "one two three four five");

console.log("\n5. MathML is left alone");
reset("<p>value of <math><mi>x</mi><mo>+</mo><mn>2</mn></math> is large</p>");
paint(rangeAcross("p", "of", "p", "is large"), root, fill("yellow"));
check("no mark inside math", root.querySelectorAll("math mark").length, 0);
check("the expression survives", root.querySelectorAll("math mi").length, 1);
check("text is unchanged", root.textContent, "value of x+2 is large");

console.log("\n6. Notes survive a recolour");
reset("<p>note me please</p>");
paint(rangeOver("p", "note me"), root, fill("yellow")).forEach((m) => writeNote(m, "remember this", "n1"));
paint(rangeOver("mark", "note me"), root, fill("blue"));
check("the note is still there", root.querySelector("mark")!.dataset.note, "remember this");
check("the colour changed", root.querySelector("mark")!.dataset.hl, "blue");

console.log("\n7. Clearing restores the passage");
const original = "<p>keep <em>this</em> exactly</p><ul><li>and this</li></ul>";
reset(original);
paint(rangeAcross("p", "keep", "li", "and this"), root, fill("pink"));
check("several marks were made", root.querySelectorAll("mark").length >= 3, true);
eraseAll(root);
root.normalize();
check("markup is byte-identical again", shape(), original);

console.log("\n8. An underline is a layer over a highlight, not a colour");
reset("<p>underline this text please</p>");
paint(rangeOver("p", "this text"), root, fill("blue"));
paint(rangeOver("mark", "this text"), root, rule("dashed"));
check("the fill survives the underline", root.querySelector("mark")!.dataset.hl, "blue");
check("and the rule is recorded beside it", root.querySelector("mark")!.dataset.ul, "dashed");
check(
  "as one mark, both attributes",
  shape(),
  '<p>underline <mark class="bb-hl" data-hl="blue" data-ul="dashed">this text</mark> please</p>',
);

paint(rangeOver("mark", "this text"), root, fill("pink"));
check("recolouring keeps the rule", root.querySelector("mark")!.dataset.ul, "dashed");
check("and changes the fill", root.querySelector("mark")!.dataset.hl, "pink");

paint(rangeOver("mark", "this text"), root, rule(null));
check("dropping the rule keeps the fill", root.querySelector("mark")!.dataset.hl, "pink");
check("and clears the rule", root.querySelector("mark")!.dataset.ul, undefined);

console.log("\n9. Underlining bare text highlights it in the armed colour");
reset("<p>bare text here</p>");
paint(rangeOver("p", "bare text"), root, rule("dotted", "blue"));
check("it became a highlight", root.querySelectorAll("mark").length, 1);
check("in the armed colour", root.querySelector("mark")!.dataset.hl, "blue");
check("wearing the rule", root.querySelector("mark")!.dataset.ul, "dotted");

console.log("\n10. Notes list one card per highlight");
reset("<p>first part</p><p>second part</p>");
const spanning = paint(rangeAcross("p", "part", "p", "second", 0, 1), root, fill("yellow"));
check("the selection made two marks", spanning.length, 2);
spanning.forEach((m) => writeNote(m, "one thought", "note-1"));
const listed = notesIn(root);
check("but one note", listed.length, 1);
check("whose heading is the whole highlighted text", listed[0].text, "partsecond");
check("and whose body is the note", listed[0].note, "one thought");
check("both marks are found by id", marksWithNote(root, "note-1").length, 2);
marksWithNote(root, "note-1").forEach((m) => writeNote(m, "", "note-1"));
check("emptying it removes the note", notesIn(root).length, 0);
check("and leaves the highlights", root.querySelectorAll("mark").length, 2);

console.log("\n11. One selection is one highlight, however many marks it took");
reset("<p>alpha bravo</p><p>charlie delta</p><p>echo foxtrot</p>");
const group = paint(rangeAcross("p", "bravo", "p", "charlie", 0, 1), root, fill("yellow"));
check("it took two marks", group.length, 2);
check("sharing one group id", new Set(group.map((m) => m.dataset.gid)).size, 1);
check("each finds the whole group", groupOf(group[0], root).length, 2);

// A separate highlight elsewhere must not be dragged in.
const other = paint(rangeOver("p", "foxtrot", 2), root, fill("blue"));
check("a separate highlight is its own group", groupOf(other[0], root).length, 1);
check("three marks in total", root.querySelectorAll("mark").length, 3);

// Underlining any part of the group underlines all of it.
groupOf(group[0], root).forEach((m) => {
  m.dataset.ul = "dotted";
});
check(
  "the rule reaches every mark of the highlight",
  [...root.querySelectorAll("mark")].filter((m) => (m as HTMLElement).dataset.ul === "dotted").length,
  2,
);

// Erasing part of it takes all of it, and leaves the other highlight alone.
erase(rangeOver("mark", "bravo"), root);
check("the whole highlight went", root.querySelectorAll("mark").length, 1);
check("and it was the right one left", root.querySelector("mark")!.textContent, "foxtrot");
check("text is unchanged", root.textContent, "alpha bravocharlie deltaecho foxtrot");

console.log("\n12. A note is keyed to the highlight, and carries its colour");
reset("<p>one two</p><p>three four</p>");
const noted = paint(rangeAcross("p", "two", "p", "three", 0, 1), root, fill("pink"));
const gid = noted[0].dataset.gid!;
noted.forEach((m) => writeNote(m, "a thought", gid));
const cards = notesIn(root);
check("one card", cards.length, 1);
check("keyed by the group", cards[0].id, gid);
check("tinted with the highlight colour", cards[0].color, "pink");
check("covering both marks", marksWithNote(root, gid).length, 2);

console.log("\n13. Re-painting the same range is a no-op");
reset("<p>same again same again</p>");
paint(rangeOver("p", "again"), root, fill("yellow"));
const before = shape();
paint(rangeOver("mark", "again"), root, fill("yellow"));
check("no empty marks accumulate", shape(), before);

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
