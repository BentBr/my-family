// Direct-line lineage computation for the family tree, shared by the
// hover highlight and the sticky "highlight mode" (click-to-pin).
//
// Given a focus person, the lineage is: every ANCESTOR (walk parent_ids
// up), every DESCENDANT (walk the parent→child index down), plus the
// focus person's DIRECT partners (a spouse's own lineage is their own
// story, so we don't recurse into it). The focus id itself is excluded
// from the returned set so the caller can style it separately (the
// "focus" card treatment) from its related lineage.
//
// Cycle-safe: a visited set short-circuits back-edges so a malformed
// graph can never spin forever.

import type { BackendNode } from './layout'

/**
 * Lineage-relation id set for `focusId` within `nodes`. Returns an empty
 * set when `focusId` is null or not present. The focus id is NOT in the
 * returned set.
 */
export function computeLineageIds(nodes: readonly BackendNode[], focusId: string | null): Set<string> {
    if (focusId === null) return new Set<string>()
    const target = nodes.find((n) => n.id === focusId)
    if (target === undefined) return new Set<string>()

    // parent → children index so the descendant walk is linear per node.
    const childrenOf = new Map<string, string[]>()
    for (const n of nodes) {
        for (const p of n.parent_ids) {
            const bucket = childrenOf.get(p)
            if (bucket === undefined) childrenOf.set(p, [n.id])
            else bucket.push(n.id)
        }
    }
    const nodeById = new Map(nodes.map((n) => [n.id, n]))

    const visited = new Set<string>([focusId])
    const out = new Set<string>()

    // Ancestors — repeatedly follow parent_ids until exhausted.
    const upQueue: string[] = [...target.parent_ids]
    while (upQueue.length > 0) {
        const cur = upQueue.shift()
        if (cur === undefined || visited.has(cur)) continue
        visited.add(cur)
        out.add(cur)
        const node = nodeById.get(cur)
        if (node !== undefined) upQueue.push(...node.parent_ids)
    }

    // Descendants — BFS over the parent→child index.
    const downQueue: string[] = [...(childrenOf.get(focusId) ?? [])]
    while (downQueue.length > 0) {
        const cur = downQueue.shift()
        if (cur === undefined || visited.has(cur)) continue
        visited.add(cur)
        out.add(cur)
        downQueue.push(...(childrenOf.get(cur) ?? []))
    }

    // Direct partners (not their lineage).
    for (const pid of target.partner_ids) out.add(pid)

    out.delete(focusId)
    return out
}

/**
 * Whether an edge connecting `aId`–`bId` lies inside the lineage of
 * `focusId`: both endpoints are either the focus person or in their
 * lineage set. Lets the full chain of inheritance light up together,
 * not just the single hop next to the focus card.
 */
export function isLineageEdge(focusId: string | null, lineage: Set<string>, aId: string, bId: string): boolean {
    if (focusId === null) return false
    const aIn = aId === focusId || lineage.has(aId)
    const bIn = bId === focusId || lineage.has(bId)
    return aIn && bIn
}
