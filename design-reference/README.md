# Design reference — the 73 V2 artboards

These are the real `.dc.html` source files from the V2 Claude Design canvas —
working HTML and CSS, the same source material `docs/BUILD_PLAN.md` was
written against. Each filename matches the artboard name `BUILD_PLAN.md`
references (e.g. `TeamHome.dc.html`, `AddEvent.dc.html`).

## How to use these

**Read the file directly, don't describe it from memory.** Each `.dc.html`
is a real, self-contained mockup — markup, inline styles, sample data. When a
`BUILD_PLAN.md` prompt says "Artboard: `TeamHome.dc.html`", open that exact
file here and port its structure/CSS into a real React component. Treat this
the same way `docs/PROJECT_KNOWLEDGE.md` says to treat pasting an artboard
into Lovable: it's the source of truth for layout, not a suggestion to
reinterpret.

**Strip the 🔑/👤 role banners before porting.** A handful of these
artboards (mostly the Team/Comp Team/Studio destination screens) carry a
gold "🔑 admin tools" or tan "👤 parent view" banner near the top. That was a
canvas-only device so a human scanning 73 mockups at once could tell which
shared screens carry role-gated controls — see each file's own inline
comment near the banner. **Do not port the banner itself.** Build the real
role-conditional rendering it stands in for instead (gate on
`isDirector`/`teamsITeach`/`compTeamsIChoreograph`, per
`docs/PROJECT_KNOWLEDGE.md`).

**`navigation-map.html`** is a visual map of how all 73 screens link to each
other — open it in a browser to get oriented before starting, especially
useful for `docs/BUILD_PLAN.md`'s later steps once there are a lot of
destinations to keep straight.

**The `.jpg` files** are the sample photos referenced by a few artboards
(dancer/team/studio photos) — placeholder imagery only, not meant to ship in
the real app; swap for the studio's actual photos or a real upload flow.

## What's NOT here

The canvas's `canvas.json` (artboard x/y layout positions on the design
canvas itself) isn't included — it has no meaning outside that canvas tool.
If you ever need to see the artboards laid out visually again rather than as
individual files, the live canvas is still published (ask whoever ran the
original design session for the link, or check the Claude project's
`v2-design-canvas-reference-*.md` doc if you have access to it).
