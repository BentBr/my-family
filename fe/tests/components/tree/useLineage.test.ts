// Unit coverage for the shared lineage walk used by both the hover
// highlight and the sticky highlight mode.

import { describe, expect, it } from 'vitest'

import type { BackendNode } from '@/components/tree/layout'
import { computeLineageIds, isLineageEdge } from '@/components/tree/useLineage'

function node(id: string, parents: string[] = [], partners: string[] = []): BackendNode {
    return { id, given_name: id, family_name: '', parent_ids: parents, partner_ids: partners }
}

// gp1 + gp2 → dad; dad + mom (married in) → kid1, kid2; kid1 → grandkid.
const nodes: BackendNode[] = [
    node('gp1', [], ['gp2']),
    node('gp2', [], ['gp1']),
    node('dad', ['gp1', 'gp2'], ['mom']),
    node('mom', [], ['dad']),
    node('kid1', ['dad', 'mom']),
    node('kid2', ['dad', 'mom']),
    node('grandkid', ['kid1']),
    node('unrelated'),
]

describe('computeLineageIds', () => {
    it('returns empty set for a null focus', () => {
        expect(computeLineageIds(nodes, null).size).toBe(0)
    })

    it('returns empty set for an unknown focus id', () => {
        expect(computeLineageIds(nodes, 'ghost').size).toBe(0)
    })

    it('walks ancestors, descendants and direct partners; excludes the focus itself', () => {
        const out = computeLineageIds(nodes, 'dad')
        // ancestors gp1, gp2; descendants kid1, kid2, grandkid; partner mom.
        expect([...out].sort()).toEqual(['gp1', 'gp2', 'grandkid', 'kid1', 'kid2', 'mom'])
        expect(out.has('dad')).toBe(false)
        expect(out.has('unrelated')).toBe(false)
    })

    it('does NOT recurse into a partner lineage (only direct partners)', () => {
        // Focus kid1: ancestors dad, mom, gp1, gp2; descendant grandkid.
        // kid2 is a sibling (NOT in kid1's direct line) so must be absent.
        const out = computeLineageIds(nodes, 'kid1')
        expect(out.has('grandkid')).toBe(true)
        expect(out.has('dad')).toBe(true)
        expect(out.has('mom')).toBe(true)
        expect(out.has('kid2')).toBe(false)
    })

    it('is cycle-safe (a back-edge does not loop forever)', () => {
        const cyclic = [node('a', ['b']), node('b', ['a'])]
        const out = computeLineageIds(cyclic, 'a')
        expect(out.has('b')).toBe(true)
    })
})

describe('isLineageEdge', () => {
    it('is true only when BOTH endpoints are the focus or in its lineage', () => {
        const lineage = computeLineageIds(nodes, 'dad')
        expect(isLineageEdge('dad', lineage, 'dad', 'gp1')).toBe(true) // focus ↔ ancestor
        expect(isLineageEdge('dad', lineage, 'kid1', 'grandkid')).toBe(true) // two descendants
        expect(isLineageEdge('dad', lineage, 'dad', 'unrelated')).toBe(false) // one outsider
        expect(isLineageEdge(null, lineage, 'dad', 'gp1')).toBe(false) // no focus
    })
})
