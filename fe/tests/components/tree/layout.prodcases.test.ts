// Layout invariants derived from real production family shapes
// (anonymized). Each pins one fix for a case the synthetic fixtures
// didn't cover:
//
//   - root recenter over a parent-edge descendant (a grandparent sits
//     directly above their child inside a shared multi-couple chain);
//   - single-parent fallback in groupChildrenByCouple (a child with only
//     one parent recorded still groups under that parent's couple);
//   - in-married sibling grouped by blood parent, not members[0] (a
//     couple block led by the married-in spouse still groups under the
//     blood child's parents);
//   - bridging couple hangs under the more-connected family (a child
//     married to a leaf-root in-law sits with their own siblings);
//   - parent-edge-aware root barycenter (top-row roots reorder so each
//     parent is above their own child).
//
// These mirror the same fixes seeded in the "Vellmar" / "Lang" families
// (see crates/seeder/src/vellmar.rs + lang.rs) but with reduced
// role-named fixtures for fast, isolated assertions.

import { describe, expect, it } from 'vitest'

import { COL_GAP, layoutTree, NODE_W, type TreeInput } from '@/components/tree/layout'

interface PartnerEdgeInput {
    a: string
    b: string
    ended_on?: string | null
}

function person(
    id: string,
    parents: string[] = [],
    partners: string[] = [],
    birth?: string,
): TreeInput['nodes'][number] {
    return {
        id,
        given_name: `G${id}`,
        family_name: `F${id}`,
        ...(birth === undefined ? {} : { birth_date: birth }),
        parent_ids: parents,
        partner_ids: partners,
    }
}

function xOf(out: ReturnType<typeof layoutTree>, id: string): number {
    const n = out.nodes.find((node) => node.id === id)
    if (n === undefined) throw new Error(`person ${id} not in layout`)
    return n.x
}

describe('layoutTree — root recenter over parent-edge descendant', () => {
    it('positions a top-row root above its only parent-edge descendant', () => {
        // The barycenter-sort pass orders the two top-row mothers
        // correctly (mother of the left-side chain member sits LEFT,
        // mother of the right-side member sits RIGHT), but it doesn't
        // REPOSITION them — runPlacement places the second root at
        // `cursor + CLUSTER_GAP` after the first root's subtree, so
        // the right-side mother ends up far right of the chain
        // instead of directly above her son. The root-recenter pass
        // fixes that.
        //
        // Setup: chain [son_a, anchor, son_b] under mother_a (son_a's
        // mother) and mother_b (son_b's mother). Anchor is the
        // shared spouse with one ENDED partner (son_a) + one OPEN
        // partner (son_b).
        const out = layoutTree({
            nodes: [
                person('mother_a', [], [], '1912-03-29'),
                person('mother_b', [], [], '1921-03-25'),
                person('son_b', ['mother_b'], ['anchor'], '1942-11-25'),
                person('son_a', ['mother_a'], ['anchor'], '1955-06-10'),
                person('anchor', [], ['son_a', 'son_b'], '1958-09-12'),
            ],
            parent_edges: [
                { a: 'son_b', b: 'mother_b' },
                { a: 'son_a', b: 'mother_a' },
            ],
            partner_edges: [
                { a: 'anchor', b: 'son_a', ended_on: '1990-04-12' },
                { a: 'anchor', b: 'son_b' },
            ] as PartnerEdgeInput[],
        })
        // Each mother's card-centre should land approximately on her
        // son's card-centre (within NODE_W/2 — row separation can
        // nudge if the parent-row neighbours collide). The tight
        // tolerance asserts the recenter pass actually FIRED.
        const motherACenter = xOf(out, 'mother_a') + NODE_W / 2
        const motherBCenter = xOf(out, 'mother_b') + NODE_W / 2
        const sonACenter = xOf(out, 'son_a') + NODE_W / 2
        const sonBCenter = xOf(out, 'son_b') + NODE_W / 2
        expect(Math.abs(motherACenter - sonACenter)).toBeLessThanOrEqual(NODE_W / 2)
        expect(Math.abs(motherBCenter - sonBCenter)).toBeLessThanOrEqual(NODE_W / 2)
    })
})

describe('layoutTree — single-parent fallback in groupChildrenByCouple', () => {
    it('groups a single-parent child under the couple containing their listed parent (not the rightmost)', () => {
        // Multi-couple chain [dad_l, mom, dad_r]. Child A (1984) has
        // BOTH bio parents recorded (dad_l + mom). Child B (1981)
        // has ONLY dad_l recorded — a common shape in real family
        // trees where the user adds one parent_link per child and
        // forgets the second.
        //
        // The legacy "both parents in couple → match, else fallback
        // to rightmost" rule attached child B to the mom+dad_r
        // sub-cluster (rightmost), pushing him visually RIGHT of
        // child A even though they're meant to be siblings of the
        // dad_l+mom couple. The graceful single-parent match
        // attaches him to the dad_l+mom couple instead, where
        // sibling-by-age sorting then places child B 1981 LEFT of
        // child A 1984.
        const out = layoutTree({
            nodes: [
                person('dad_l', [], ['mom'], '1955-06-10'),
                person('mom', [], ['dad_l', 'dad_r'], '1958-09-12'),
                person('dad_r', [], ['mom'], '1942-11-25'),
                person('child_a', ['dad_l', 'mom'], ['spouse_a'], '1984-06-25'),
                person('spouse_a', [], ['child_a'], '1985-01-01'),
                // Child B has ONLY dad_l as bio parent — mom NOT
                // listed. With the legacy fallback he'd land in the
                // mom+dad_r sub-cluster on the right.
                person('child_b', ['dad_l'], [], '1981-09-12'),
                person('child_c', ['mom', 'dad_r'], [], '1987-03-31'),
            ],
            parent_edges: [
                { a: 'child_a', b: 'dad_l' },
                { a: 'child_a', b: 'mom' },
                { a: 'child_b', b: 'dad_l' },
                { a: 'child_c', b: 'mom' },
                { a: 'child_c', b: 'dad_r' },
            ],
            partner_edges: [
                { a: 'dad_l', b: 'mom', ended_on: '1990-04-12' },
                { a: 'mom', b: 'dad_r' },
                { a: 'child_a', b: 'spouse_a' },
            ] as PartnerEdgeInput[],
        })
        // Child B (1981) must sit LEFT of child A (1984) — they
        // share the dad_l+mom sub-cluster, sibling-by-age applies.
        expect(xOf(out, 'child_b')).toBeLessThan(xOf(out, 'child_a'))
        // Child C — child of mom+dad_r — should sit RIGHT of both
        // dad_l-line siblings (different sub-cluster, current
        // partnership goes rightmost).
        expect(xOf(out, 'child_a')).toBeLessThan(xOf(out, 'child_c'))
    })
})

describe('layoutTree — in-married sibling grouped by blood parent, not members[0]', () => {
    it('keeps an older sibling whose couple-block leads with the married-in spouse LEFT of a younger singleton sibling', () => {
        // The bug: a sibling (older_kid, 1981) is married to a
        // spouse (a_inlaw) whose id sorts FIRST, so the couple block
        // is [a_inlaw, older_kid] with members[0] === a_inlaw. The
        // married-in spouse has no bio parents in this family, so
        // grouping-by-members[0] dropped older_kid into the rightmost
        // couple's sub-cluster — stranding him among the OTHER
        // couple's children and forcing the younger singleton sibling
        // (younger_kid, 1984) to render to his left.
        //
        // After the fix `groupChildrenByCouple` unions bio parents
        // across ALL block members, so older_kid is recognised as a
        // child of the dad_l+mom couple and sibling-by-age places him
        // (1981) LEFT of younger_kid (1984).
        const out = layoutTree({
            nodes: [
                person('dad_l', [], ['mom'], '1950-01-01'),
                person('mom', [], ['dad_l', 'dad_r'], '1958-09-12'),
                person('dad_r', [], ['mom'], '1942-11-25'),
                // dad_l+mom kids: a younger singleton + an older one
                // married to a smaller-id spouse.
                person('younger_kid', ['dad_l', 'mom'], [], '1984-06-25'),
                person('older_kid', ['dad_l', 'mom'], ['a_inlaw'], '1981-09-12'),
                person('a_inlaw', [], ['older_kid']), // id sorts before older_kid
                // mom+dad_r kid so the chain genuinely has 2 couples.
                person('other_kid', ['mom', 'dad_r'], [], '1987-03-31'),
            ],
            parent_edges: [
                { a: 'younger_kid', b: 'dad_l' },
                { a: 'younger_kid', b: 'mom' },
                { a: 'older_kid', b: 'dad_l' },
                { a: 'older_kid', b: 'mom' },
                { a: 'other_kid', b: 'mom' },
                { a: 'other_kid', b: 'dad_r' },
            ],
            partner_edges: [
                { a: 'dad_l', b: 'mom' }, // open (both marriages concurrent)
                { a: 'mom', b: 'dad_r' }, // open
                { a: 'older_kid', b: 'a_inlaw' },
            ] as PartnerEdgeInput[],
        })
        // older_kid (1981) LEFT of younger_kid (1984): same sub-cluster.
        expect(xOf(out, 'older_kid')).toBeLessThan(xOf(out, 'younger_kid'))
        // both dad_l+mom kids LEFT of the mom+dad_r kid.
        expect(xOf(out, 'younger_kid')).toBeLessThan(xOf(out, 'other_kid'))
    })
})

describe('layoutTree — bridging couple hangs under the more-connected family', () => {
    it('places a child married to a leaf-root in-law next to their own siblings, not banished to the in-law cluster', () => {
        // bridge_kid is a blood child of the main couple (main_mom +
        // main_dad), which reaches up to a grandparent. bridge_kid
        // married bridge_inlaw, who is the blood child of a SEPARATE
        // leaf-root couple (inlaw_dad + inlaw_mom, no ancestors).
        //
        // The bug: the couple block [bridge_inlaw, bridge_kid] hung
        // under whichever member had the smaller id → bridge_inlaw →
        // the leaf-root in-law cluster, dragging bridge_kid far away
        // from their siblings and leaving a gap in the sibling row.
        //
        // After the fix `chooseParentBlock` prefers the candidate
        // parent block that itself has ancestors (the main family),
        // so the couple hangs there and bridge_kid sits beside its
        // siblings; bridge_inlaw's edge to the leaf-root parents
        // stretches instead.
        const out = layoutTree({
            nodes: [
                person('grandparent', [], [], '1930-01-01'),
                person('main_mom', ['grandparent'], ['main_dad'], '1958-01-01'),
                person('main_dad', [], ['main_mom'], '1956-01-01'),
                person('sib_a', ['main_mom', 'main_dad'], [], '1985-01-01'),
                person('sib_b', ['main_mom', 'main_dad'], [], '1986-01-01'),
                // bridge_kid married to bridge_inlaw (smaller id).
                person('bridge_kid', ['main_mom', 'main_dad'], ['a_bridge_inlaw'], '1988-01-01'),
                person('a_bridge_inlaw', ['inlaw_dad', 'inlaw_mom'], ['bridge_kid'], '1987-01-01'),
                // Leaf-root in-law couple (no ancestors).
                person('inlaw_dad', [], ['inlaw_mom'], '1955-01-01'),
                person('inlaw_mom', [], ['inlaw_dad'], '1957-01-01'),
            ],
            parent_edges: [
                { a: 'main_mom', b: 'grandparent' },
                { a: 'sib_a', b: 'main_mom' },
                { a: 'sib_a', b: 'main_dad' },
                { a: 'sib_b', b: 'main_mom' },
                { a: 'sib_b', b: 'main_dad' },
                { a: 'bridge_kid', b: 'main_mom' },
                { a: 'bridge_kid', b: 'main_dad' },
                { a: 'a_bridge_inlaw', b: 'inlaw_dad' },
                { a: 'a_bridge_inlaw', b: 'inlaw_mom' },
            ],
            partner_edges: [
                { a: 'main_mom', b: 'main_dad' },
                { a: 'bridge_kid', b: 'a_bridge_inlaw' },
                { a: 'inlaw_dad', b: 'inlaw_mom' },
            ] as PartnerEdgeInput[],
        })
        // bridge_kid sits adjacent to its siblings: the gap between
        // sib_b and bridge_kid is no wider than one sibling slot.
        const sibBX = xOf(out, 'sib_b')
        const bridgeX = xOf(out, 'bridge_kid')
        // bridge_kid is to the right of its siblings but within a
        // couple-width-plus-gap of sib_b (i.e. NOT flung across the
        // whole in-law cluster). NODE_W + COL_GAP is one slot; allow
        // up to ~3 slots for the couple block + cluster gap.
        expect(bridgeX).toBeGreaterThan(sibBX)
        expect(bridgeX - sibBX).toBeLessThan(3 * (NODE_W + COL_GAP))
        // The in-law father (leaf root) is NOT between the siblings —
        // he's pushed out past bridge_kid's couple.
        expect(xOf(out, 'inlaw_dad')).toBeGreaterThan(bridgeX)
    })

    it('keeps an in-laws couple centred over their in-subtree kids, not dragged toward a married-out child', () => {
        // Flip side of the bridging case, from the in-laws' OWN tree
        // view. The inlaw couple (in_dad + in_mom, a leaf root) has
        // three children: married_out (who married into the main tree
        // → her couple hangs there) plus two who stay in the inlaw
        // subtree (stay_a, stay_b).
        //
        // The recenter must centre the inlaw couple over stay_a +
        // stay_b (its OWN, co-located kids) — NOT average in the
        // married-out child, which sits far away under the main tree
        // and would drag the couple off its remaining kids (the
        // Quanten/Kira+Juna dislocation).
        const out = layoutTree({
            nodes: [
                // Main tree the married-out child joins (gives it depth
                // so the bridge hangs on the main side).
                person('main_gp', [], [], '1930-01-01'),
                person('main_mom', ['main_gp'], ['main_dad'], '1958-01-01'),
                person('main_dad', [], ['main_mom'], '1956-01-01'),
                person('main_kid', ['main_mom', 'main_dad'], ['a_married_out'], '1988-01-01'),
                person('a_married_out', ['in_dad', 'in_mom'], ['main_kid'], '1986-01-01'),
                // Leaf-root in-laws + their two stay-home kids.
                person('in_dad', [], ['in_mom'], '1947-01-01'),
                person('in_mom', [], ['in_dad'], '1950-01-01'),
                person('stay_a', ['in_dad', 'in_mom'], [], '1988-11-09'),
                person('stay_b', ['in_dad', 'in_mom'], [], '1992-06-26'),
            ],
            parent_edges: [
                { a: 'main_mom', b: 'main_gp' },
                { a: 'main_kid', b: 'main_mom' },
                { a: 'main_kid', b: 'main_dad' },
                { a: 'a_married_out', b: 'in_dad' },
                { a: 'a_married_out', b: 'in_mom' },
                { a: 'stay_a', b: 'in_dad' },
                { a: 'stay_a', b: 'in_mom' },
                { a: 'stay_b', b: 'in_dad' },
                { a: 'stay_b', b: 'in_mom' },
            ],
            partner_edges: [
                { a: 'main_mom', b: 'main_dad' },
                { a: 'main_kid', b: 'a_married_out' },
                { a: 'in_dad', b: 'in_mom' },
            ] as PartnerEdgeInput[],
        })
        // The in-laws couple's midpoint sits ~above the stay_a/stay_b
        // midpoint (within one card width), NOT pulled left toward the
        // married-out child.
        const coupleMid = (xOf(out, 'in_dad') + xOf(out, 'in_mom') + NODE_W) / 2
        const kidsMid = (xOf(out, 'stay_a') + xOf(out, 'stay_b') + NODE_W) / 2
        expect(Math.abs(coupleMid - kidsMid)).toBeLessThanOrEqual(NODE_W)
    })
})

describe('layoutTree — parent-edge-aware barycenter', () => {
    it('reorders top-row roots so each mother sits above her own child in a shared-chain row', () => {
        // Top row has mother_a + mother_b (both roots). Middle row
        // has a 3-person chain [son_a, anchor, son_b] — anchor is
        // the shared spouse with son_a as ENDED partner and son_b
        // as OPEN. son_a is mother_a's child, son_b is mother_b's.
        //
        // The block-tree-based barycenter would attribute the entire
        // chain to mother_a (because `chooseParentBlock` picks the
        // chain's first parent-bearing member → son_a → mother_a),
        // leaving mother_b with 0 descendants and keeping her at
        // the default leftmost slot. Parent-edge-aware barycenter
        // walks both lineages and pulls mother_b over to above
        // son_b's column.
        const out = layoutTree({
            nodes: [
                person('mother_b', [], [], '1912-03-29'),
                person('mother_a', [], [], '1921-03-25'),
                person('son_b', ['mother_b'], ['anchor'], '1942-11-25'),
                person('son_a', ['mother_a'], ['anchor'], '1955-06-10'),
                person('anchor', [], ['son_a', 'son_b'], '1958-09-12'),
            ],
            parent_edges: [
                { a: 'son_b', b: 'mother_b' },
                { a: 'son_a', b: 'mother_a' },
            ],
            partner_edges: [
                { a: 'anchor', b: 'son_a', ended_on: '1990-04-12' },
                { a: 'anchor', b: 'son_b' },
            ] as PartnerEdgeInput[],
        })
        const motherB = xOf(out, 'mother_b')
        const motherA = xOf(out, 'mother_a')
        const sonA = xOf(out, 'son_a')
        const sonB = xOf(out, 'son_b')
        // Whichever child lands on the left, the matching mother
        // must be on the same side. The chain rule places ENDED
        // on the LEFT — so son_a (ended) ends up left of son_b
        // (open), which means mother_a (son_a's mother) must end
        // up LEFT of mother_b.
        expect(sonA).toBeLessThan(sonB)
        expect(motherA).toBeLessThan(motherB)
    })
})
